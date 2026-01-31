import { AbstractFileProviderService } from "@medusajs/framework/utils";
import type {
  Logger,
  ProviderUploadFileDTO,
  ProviderFileResultDTO,
  ProviderDeleteFileDTO,
  ProviderGetFileDTO,
} from "@medusajs/framework/types";
import { v2 as cloudinary } from "cloudinary";

type InjectedDependencies = {
  logger: Logger;
};

type CloudinaryOptions = {
  cloud_name: string;
  api_key: string;
  api_secret: string;
};

class CloudinaryFileProviderService extends AbstractFileProviderService {
  static identifier = "cloudinary";
  protected logger_: Logger;
  protected options_: CloudinaryOptions;

  constructor({ logger }: InjectedDependencies, options: CloudinaryOptions) {
    super();
    this.logger_ = logger;
    this.options_ = options;

    cloudinary.config({
      cloud_name: options.cloud_name,
      api_key: options.api_key,
      api_secret: options.api_secret,
    });
  }

  static validateOptions(options: Record<string, unknown>) {
    if (!options.cloud_name || !options.api_key || !options.api_secret) {
      throw new Error(
        "Cloudinary provider requires cloud_name, api_key, and api_secret options",
      );
    }
  }

  async upload(file: ProviderUploadFileDTO): Promise<ProviderFileResultDTO> {
    const result = await cloudinary.uploader.upload(file.content, {
      folder: "blessluxe",
      resource_type: "auto",
    });

    return {
      url: result.secure_url,
      key: result.public_id,
    };
  }

  async delete(
    files: ProviderDeleteFileDTO | ProviderDeleteFileDTO[],
  ): Promise<void> {
    const fileArray = Array.isArray(files) ? files : [files];
    for (const file of fileArray) {
      await cloudinary.uploader.destroy(file.fileKey);
    }
  }

  async getPresignedDownloadUrl(fileData: ProviderGetFileDTO): Promise<string> {
    return cloudinary.url(fileData.fileKey, {
      secure: true,
      sign_url: true,
      type: "authenticated",
    });
  }
}

export default CloudinaryFileProviderService;
