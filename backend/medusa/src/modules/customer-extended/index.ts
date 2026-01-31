import { Module } from "@medusajs/framework/utils";
import CustomerExtendedModuleService from "./service";

export const CUSTOMER_EXTENDED_MODULE = "customerExtendedModuleService";

export default Module(CUSTOMER_EXTENDED_MODULE, {
  service: CustomerExtendedModuleService,
});
