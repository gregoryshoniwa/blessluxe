import { MedusaService } from "@medusajs/framework/utils";
import CustomerExtended from "./models/customer-extended";

class CustomerExtendedModuleService extends MedusaService({
  CustomerExtended,
}) {}

export default CustomerExtendedModuleService;
