export interface VehicleConfig {
  mass: number;              // kg (default: 1650)
  rollingResistance: number; // C_rr (default: 0.010)
  dragCoefficient: number;   // C_d (default: 0.28)
  frontalArea: number;       // m² (default: 2.2)
  airDensity: number;        // kg/m³ (default: 1.225)
  regenEfficiency: number;   // eta (default: 0.65)
  maxRegenPower: number;     // Watts (default: 30000)
  drivenAxleShare: number;   // phi (default: 0.6 for FWD Camry)
  gravity: number;           // m/s² (default: 9.81)
}

export interface SampleInput {
  speed: number;             // m/s
  acceleration: number;      // m/s²
  grade: number;             // road grade as decimal ratio (e.g., 0.05 for 5% slope)
  brakePowerDemand: number;  // Watts demanded by driver braking
  surfaceFriction: number;   // mu (e.g., 0.8 for dry asphalt, 0.5 for wet, 0.25 for snow)
  batterySoC: number;        // State of Charge (0.0 to 1.0)
  batteryTemp: number;       // Celsius
}

export interface SimulationOutput {
  totalForce: number;        // Newtons
  gravityForce: number;      // Newtons
  rollingForce: number;      // Newtons
  dragForce: number;         // Newtons
  inertialForce: number;     // Newtons
  demandedBrakePower: number;// Watts
  maxPossibleRegen: number;  // Watts
  actualRegenPower: number;  // Watts
  frictionPower: number;     // Watts
  missedRegenPower: number;  // Watts
  missedReason: 'late_braking' | 'low_grip' | 'full_battery' | 'cold_battery' | null;
}

export class VehiclePhysicsSimulator {
  private config: VehicleConfig;

  constructor(config: Partial<VehicleConfig> = {}) {
    this.config = {
      mass: 1650,
      rollingResistance: 0.010,
      dragCoefficient: 0.28,
      frontalArea: 2.2,
      airDensity: 1.225,
      regenEfficiency: 0.65,
      maxRegenPower: 30000,
      drivenAxleShare: 0.6,
      gravity: 9.81,
      ...config,
    };
  }

  /**
   * Computes longitudinal vehicle forces, energy distribution, and regen limits
   * for a single second-by-second trip sample.
   */
  public step(sample: SampleInput): SimulationOutput {
    const { 
      mass, 
      rollingResistance, 
      dragCoefficient, 
      frontalArea, 
      airDensity, 
      regenEfficiency, 
      maxRegenPower, 
      drivenAxleShare, 
      gravity 
    } = this.config;
    
    const { 
      speed, 
      acceleration, 
      grade, 
      brakePowerDemand, 
      surfaceFriction, 
      batterySoC, 
      batteryTemp 
    } = sample;

    // Convert grade ratio to slope angle components (sin theta and cos theta)
    const theta = Math.atan(grade);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    // Force components (Newtons)
    const gravityForce = mass * gravity * sinTheta;
    const rollingForce = rollingResistance * mass * gravity * cosTheta;
    const dragForce = 0.5 * airDensity * dragCoefficient * frontalArea * (speed ** 2);
    const inertialForce = mass * acceleration;

    const totalForce = gravityForce + rollingForce + dragForce + inertialForce;

    let actualRegenPower = 0;
    let frictionPower = 0;
    let missedRegenPower = 0;
    let missedReason: SimulationOutput['missedReason'] = null;
    let maxPossibleRegen = 0;

    if (brakePowerDemand > 0) {
      // 1. Theoretical system cap based on motor/inverter efficiency & rating
      const theoreticalRegen = regenEfficiency * brakePowerDemand;
      maxPossibleRegen = Math.min(theoreticalRegen, maxRegenPower);

      // 2. Road grip limit constraint: a_regen_max = mu * g * phi
      const maxGripAcceleration = surfaceFriction * gravity * drivenAxleShare;
      const maxGripRegenPower = mass * maxGripAcceleration * speed;

      // 3. Battery State of Charge (SoC) limit: linear fade above 80% charge
      let socFactor = 1.0;
      if (batterySoC > 0.8) {
        socFactor = Math.max(0, (1.0 - batterySoC) / 0.2);
      }

      // 4. Battery Temperature limit: reduce acceptance if freezing (< 0 C)
      let tempFactor = 1.0;
      if (batteryTemp < 0) {
        tempFactor = Math.max(0.1, 1.0 + (batteryTemp / 20));
      }

      const batteryAcceptanceLimit = maxRegenPower * socFactor * tempFactor;

      // Final actual regen is bounded by motor limit, tire grip limit, and battery acceptance
      actualRegenPower = Math.min(maxPossibleRegen, maxGripRegenPower, batteryAcceptanceLimit);
      frictionPower = brakePowerDemand - actualRegenPower;
      missedRegenPower = brakePowerDemand - actualRegenPower;

      // Classify the bottleneck causing missed energy recovery
      if (actualRegenPower < theoreticalRegen) {
        if (batterySoC > 0.8 && actualRegenPower >= batteryAcceptanceLimit) {
          missedReason = 'full_battery';
        } else if (batteryTemp < 0 && actualRegenPower >= batteryAcceptanceLimit) {
          missedReason = 'cold_battery';
        } else if (maxGripRegenPower < theoreticalRegen && maxGripRegenPower <= batteryAcceptanceLimit) {
          missedReason = 'low_grip';
        } else {
          missedReason = 'late_braking';
        }
      }
    }

    return {
      totalForce,
      gravityForce,
      rollingForce,
      dragForce,
      inertialForce,
      demandedBrakePower: brakePowerDemand,
      maxPossibleRegen,
      actualRegenPower,
      frictionPower,
      missedRegenPower,
      missedReason,
    };
  }
}