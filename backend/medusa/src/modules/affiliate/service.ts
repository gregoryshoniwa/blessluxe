import { MedusaService } from "@medusajs/framework/utils";
import Affiliate from "./models/affiliate";
import AffiliateSale from "./models/affiliate-sale";
import AffiliatePayout from "./models/affiliate-payout";

class AffiliateModuleService extends MedusaService({
  Affiliate,
  AffiliateSale,
  AffiliatePayout,
}) {}

export default AffiliateModuleService;
