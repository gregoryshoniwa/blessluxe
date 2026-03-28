import { Module } from "@medusajs/framework/utils";
import PackModuleService from "./service";

export const PACK_MODULE = "packModuleService";

export default Module(PACK_MODULE, {
  service: PackModuleService,
});
