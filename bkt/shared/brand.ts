// BachKhoa Technology brand tokens. Tertiary lime is reserved for success states.
export const BRAND = {
  primary: "#00ADEF",
  secondary: "#3F51B5",
  tertiary: "#A2D149",
  surface0: "#0E1012",
  surface1: "#1A1C1E",
  surface2: "#212428",
  surface3: "#282B30",
  text: "#F0F4F8",
  textMuted: "#94A3B8",
  danger: "#EF4444",
} as const;

export const BRAND_VARS = {
  primary: "--bkt-primary",
  secondary: "--bkt-secondary",
  tertiary: "--bkt-tertiary",
  surface0: "--bkt-surface-0",
  surface1: "--bkt-surface-1",
  surface2: "--bkt-surface-2",
  surface3: "--bkt-surface-3",
  text: "--bkt-text",
  textMuted: "--bkt-text-muted",
  danger: "--bkt-danger",
} as const satisfies Record<keyof typeof BRAND, string>;

export const COMPANY = "BachKhoa Technology";
export const AUTHOR = { name: "Son Do", email: "sondn2010@gmail.com" } as const;
