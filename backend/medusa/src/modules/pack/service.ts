import { MedusaService } from "@medusajs/framework/utils";
import PackDefinition from "./models/pack-definition";
import PackCampaign from "./models/pack-campaign";
import PackSlot from "./models/pack-slot";
import PackEvent from "./models/pack-event";

class PackModuleService extends MedusaService({
  PackDefinition,
  PackCampaign,
  PackSlot,
  PackEvent,
}) {}

export default PackModuleService;
