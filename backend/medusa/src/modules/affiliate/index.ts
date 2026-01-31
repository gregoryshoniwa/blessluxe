import { Module } from "@medusajs/framework/utils";
import AffiliateModuleService from "./service";

export const AFFILIATE_MODULE = "affiliateModuleService";

export default Module(AFFILIATE_MODULE, {
  service: AffiliateModuleService,
});
