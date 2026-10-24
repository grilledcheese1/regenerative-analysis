export type SurfaceType = 'dry_asphalt' | 'wet_asphalt' | 'packed_snow' | 'ice' | 'gravel' | 'wet_mud';
export type DriverProfileType = 'smooth' | 'aggressive' | 'mixed';
export type MissedReason = 'late_braking' | 'low_grip' | 'full_battery' | 'cold_battery';

export interface SurfaceProperties {
  friction: number;       // mu
  rollingResistance: number; // C_rr
}

// Surface lookup table based on plan specifications
export const SURFACE_CONFIGS: Record<SurfaceType, SurfaceProperties> = {
  dry_asphalt: { friction: 0.8, rollingResistance: 0.010 },
  wet_asphalt: { friction: 0.5, rollingResistance: 0.012 },
  packed_snow: { friction: 0.25, rollingResistance: 0.018 },
  ice: { friction: 0.1, rollingResistance: 0.015 },
  gravel: { friction: 0.5, rollingResistance: 0.020 },
  wet_mud: { friction: 0.25, rollingResistance: 0.040 },
};

export interface RouteSample {
  timeOffset: number;     // seconds
  speed: number;          // m/s
  acceleration: number;   // m/s²
  elevation: number;      // meters
  grade: number;          // decimal grade ratio (e.g., 0.05)
  brakePressure: number;  // normalized [0, 1] or raw pressure units
  isStop?: boolean;       // whether this sample corresponds to a stop sign/signal
}

export interface TripInput {
  tripId: string;
  driverLabel: DriverProfileType;
  samples: RouteSample[];
}

export interface TripSimulationConfig {
  mass: number;             // kg (default: 1650)
  dragCoefficient: number;  // C_d (default: 0.28)
  frontalArea: number;      // m² (default: 2.2)
  airDensity: number;       // kg/m³ (default: 1.225)
  regenEfficiency: number;  // eta (default: 0.65)
  maxRegenPower: number;    // Watts (default: 30000)
  drivenAxleShare: number;  // phi (default: 0.6)
  gravity: number;          // m/s² (default: 9.81)
  
  // Environmental & Vehicle State
  surfaceType: SurfaceType;
  batterySoC: number;       // 0.0 to 1.0
  batteryTemp: number;      // Celsius
  regenEnabled: boolean;    // Regen on/off toggle for conventional baseline
  
  // Savings parameters
  gasPrice: number;         // Dollars per gallon (e.g., 3.00)
  tripsPerDay: number;      // Default trips per day for annual projection
  engineEfficiency: number; // Internal combustion engine efficiency (default: 0.30)
}

export interface MissedOpportunity {
  timeOffset: number;
  missedPower: number;      // Watts
  cause: MissedReason;
}

export interface SavingsMetrics {
  gallonsSaved: number;
  dollarsSaved: number;
  co2AvoidedKg: number;
  brakeWearAvoidedPercent: number;
  moneyLeftOnTable: number;
  annualGallonsSaved: number;
  annualDollarsSaved: number;
  annualCo2AvoidedKg: number;
}

export interface TripEvaluationResult {
  tripId: string;
  driverProfile: DriverProfileType;
  surfaceType: SurfaceType;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  actualRegenKWh: number;
  ceilingEnergyKWh: number;
  tripScore: number;        // 0 to 100
  missedOpportunities: MissedOpportunity[];
  savings: SavingsMetrics;
}

/**
   * Adjusts driver braking demand based on profile characteristics.
   * Smooth drivers brake earlier/softer; aggressive drivers brake later/harder.
   */
function applyDriverProfileFactor(brakePressure: number, profile: DriverProfileType): number {
  switch (profile) {
    case 'smooth':
      return brakePressure * 0.85; // softer braking, higher regen capture potential
    case 'aggressive':
      return brakePressure * 1.25; // hard braking, often exceeds grip or motor limits
    case 'mixed':
    default:
      return brakePressure;
  }
}

/**
   * Evaluates a complete trip route against physics, weather/surface constraints,
   * battery limits, and calculates economic and environmental savings.
   */
export function evaluateTrip(
  trip: TripInput,
  config: TripSimulationConfig
): TripEvaluationResult {
  const surfaceProps = SURFACE_CONFIGS[config.surfaceType];
  const {
    mass,
    dragCoefficient,
    frontalArea,
    airDensity,
    regenEfficiency,
    maxRegenPower,
    drivenAxleShare,
    gravity,
    regenEnabled,
    batterySoC,
    batteryTemp,
    gasPrice,
    tripsPerDay,
    engineEfficiency,
  } = config;

  let totalRegenJoules = 0;
  let totalDescentMeters = 0;
  const stopKineticEnergies: number[] = [];
  const missedOpportunities: MissedOpportunity[] = [];
  
  let totalDistanceMeters = 0;
  let totalFrictionEnergyJoules = 0;
  let totalBrakeEnergyDemandedJoules = 0;

  // 1. Pass 1: Compute Descents and Stop Kinetic Energies to establish Ceiling Energy (E_ceiling)
  for (let i = 0; i < trip.samples.length; i++) {
    const sample = trip.samples[i];
    
    // Track distance if not explicit (speed * delta_t)
    if (i > 0) {
      const dt = sample.timeOffset - trip.samples[i - 1].timeOffset;
      totalDistanceMeters += sample.speed * Math.max(0, dt);
      
      const elevationChange = sample.elevation - trip.samples[i - 1].elevation;
      if (elevationChange < 0) {
        totalDescentMeters += Math.abs(elevationChange);
      }
    }

    if (sample.isStop || sample.speed < 0.5 && sample.acceleration < -1.0) {
      // Kinetic energy at stop: 0.5 * m * v^2
      const stopKe = 0.5 * mass * (sample.speed ** 2);
      stopKineticEnergies.push(stopKe);
    }
  }

  // Theoretical ceiling energy calculation: E_ceiling = eta * (m * g * Delta_h_descent + sum(0.5 * m * v_stop^2))
  const descentPotentialEnergy = mass * gravity * totalDescentMeters;
  const totalStopKineticEnergy = stopKineticEnergies.reduce((acc, val) => acc + val, 0);
  const ceilingEnergyJoules = regenEfficiency * (descentPotentialEnergy + totalStopKineticEnergy);
  const ceilingEnergyKWh = ceilingEnergyJoules / 3.6e6;

  // 2. Pass 2: Second-by-second simulation loop
  for (let i = 0; i < trip.samples.length; i++) {
    const sample = trip.samples[i];
    const dt = i === 0 ? 1 : sample.timeOffset - trip.samples[i - 1].timeOffset;
    if (dt <= 0) continue;

    // Adjust driver brake pressure demand according to profile
    const adjustedBrakeDemand = applyDriverProfileFactor(sample.brakePressure, trip.driverLabel);
    
    // Map brake pressure to demanded brake power (Watts)
    const brakePowerDemand = adjustedBrakeDemand * 50000; // scaling factor to Watts
    totalBrakeEnergyDemandedJoules += brakePowerDemand * dt;

    if (brakePowerDemand <= 0 || !regenEnabled) {
      // If regen is disabled (conventional car baseline) or no braking demanded
      if (brakePowerDemand > 0) {
        totalFrictionEnergyJoules += brakePowerDemand * dt;
      }
      continue;
    }

    // Theoretical regen based on motor efficiency and demand
    const theoreticalRegen = regenEfficiency * brakePowerDemand;
    let maxPossibleRegen = Math.min(theoreticalRegen, maxRegenPower);

    // Road grip limit constraint: a_regen_max = mu * g * phi
    const maxGripAcceleration = surfaceProps.friction * gravity * drivenAxleShare;
    const maxGripRegenPower = mass * maxGripAcceleration * sample.speed;

    // Battery State of Charge (SoC) limit: linear fade above 80% charge[cite: 1]
    let socFactor = 1.0;
    if (batterySoC > 0.8) {
      socFactor = Math.max(0, (1.0 - batterySoC) / 0.2);
    }

    // Battery Temperature limit: reduce acceptance on freezing days (< 0 C)[cite: 1]
    let tempFactor = 1.0;
    if (batteryTemp < 0) {
      tempFactor = Math.max(0.1, 1.0 + (batteryTemp / 20));
    }

    const batteryAcceptanceLimit = maxRegenPower * socFactor * tempFactor;

    // Actual regen power is bounded by motor limit, tire grip limit, and battery acceptance[cite: 1]
    const actualRegenPower = Math.min(maxPossibleRegen, maxGripRegenPower, batteryAcceptanceLimit);
    const frictionPower = brakePowerDemand - actualRegenPower;
    
    totalRegenJoules += actualRegenPower * dt;
    totalFrictionEnergyJoules += frictionPower * dt;

    // Classify missed opportunities[cite: 1]
    if (actualRegenPower < theoreticalRegen) {
      const missedPower = theoreticalRegen - actualRegenPower;
      let cause: MissedReason = 'late_braking';

      if (batterySoC > 0.8 && actualRegenPower >= batteryAcceptanceLimit) {
        cause = 'full_battery';
      } else if (batteryTemp < 0 && actualRegenPower >= batteryAcceptanceLimit) {
        cause = 'cold_battery';
      } else if (maxGripRegenPower < theoreticalRegen && maxGripRegenPower <= batteryAcceptanceLimit) {
        cause = 'low_grip';
      }

      missedOpportunities.push({
        timeOffset: sample.timeOffset,
        missedPower,
        cause,
      });
    }
  }

  const actualRegenKWh = totalRegenJoules / 3.6e6;
  const tripScore = ceilingEnergyKWh > 0 ? Math.min(100, Math.max(0, 100 * (actualRegenKWh / ceilingEnergyKWh))) : 0;

  // 3. Savings Module Calculations
  // 1 gallon gasoline = 33.7 kWh; engine efficiency converts useful work[cite: 1]
  const usefulKWhPerGallon = 33.7 * engineEfficiency;
  const gallonsSaved = actualRegenKWh / usefulKWhPerGallon;
  const dollarsSaved = gallonsSaved * gasPrice;
  
  // CO2 avoided: ~8.9 kg CO2 per gallon of gasoline (EPA figure)[cite: 1]
  const co2AvoidedKg = gallonsSaved * 8.9;

  // Brake wear avoided percentage based on energy handled by regen vs total friction/brake demand
  const totalBrakeEnergyDemanded = totalRegenJoules + totalFrictionEnergyJoules;
  const brakeWearAvoidedPercent = totalBrakeEnergyDemanded > 0 
    ? (totalRegenJoules / totalBrakeEnergyDemanded) * 100 
    : 0;

  // Money left on the table from missed opportunities[cite: 1]
  const totalMissedJoules = missedOpportunities.reduce((acc, curr) => acc + (curr.missedPower * 1), 0); // approx per sample sum
  const missedKWh = totalMissedJoules / 3.6e6;
  const moneyLeftOnTable = (missedKWh / usefulKWhPerGallon) * gasPrice;

  // Annual projections (trip result * trips per day * 365)[cite: 1]
  const annualMultiplier = tripsPerDay * 365;
  const annualGallonsSaved = gallonsSaved * annualMultiplier;
  const annualDollarsSaved = dollarsSaved * annualMultiplier;
  const annualCo2AvoidedKg = co2AvoidedKg * annualMultiplier;

  return {
    tripId: trip.tripId,
    driverProfile: trip.driverLabel,
    surfaceType: config.surfaceType,
    totalDistanceMeters,
    totalDurationSeconds: trip.samples.length > 0 ? trip.samples[trip.samples.length - 1].timeOffset : 0,
    actualRegenKWh,
    ceilingEnergyKWh,
    tripScore,
    missedOpportunities,
    savings: {
      gallonsSaved,
      dollarsSaved,
      co2AvoidedKg,
      brakeWearAvoidedPercent,
      moneyLeftOnTable,
      annualGallonsSaved,
      annualDollarsSaved,
      annualCo2AvoidedKg,
    },
  };
}