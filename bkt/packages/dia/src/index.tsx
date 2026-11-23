import { registerPlugin } from "@bkt/shared/sdk";
import { DIA_COMMON_PLUGIN } from "./dia-api";
import { DiaConsole } from "./DiaConsole";

// The bundle ships inside bkt_dia_common, so it registers under that plugin's manifest name.
registerPlugin(DIA_COMMON_PLUGIN, DiaConsole);
