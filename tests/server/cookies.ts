// A stand-in for next/headers cookies() so route handlers can run under Vitest.
// Tests pick the current owner with asOwner(); ownerId() then reads that cookie.

const UUIDS = {
  a: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  b: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
} as const;

let current: string | undefined = UUIDS.a;
export const setCookies: { name: string; value: string }[] = [];

export const asOwner = (who: keyof typeof UUIDS | null) => {
  current = who ? UUIDS[who] : undefined;
};
export const ownerUuid = (who: keyof typeof UUIDS) => UUIDS[who];

export const cookiesMock = async () => ({
  get: (name: string) => (name === "nm_sid" && current ? { name, value: current } : undefined),
  set: (name: string, value: string) => {
    setCookies.push({ name, value });
    current = value;
  },
});
