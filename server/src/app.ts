import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import sharp from "sharp";
import {
  auditSchema,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "../../shared/audit.js";
import { analyzeImage, AuditError } from "./audit.js";
import { getConfig } from "./config.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2 },
  fileFilter: (_request, file, done) => {
    if (!(IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
      done(
        new AuditError(
          415,
          "UNSUPPORTED_IMAGE",
          "Choose a PNG, JPEG, or WebP screenshot.",
        ),
      );
    } else done(null, true);
  },
});

export async function validateImage(
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  const formats: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/webp": "webp",
  };
  try {
    const image = sharp(bytes, {
      limitInputPixels: 25_000_000,
      failOn: "warning",
      animated: true,
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.format !== formats[mimeType] ||
      (metadata.pages ?? 1) > 1 ||
      metadata.width * metadata.height > 25_000_000
    ) {
      throw new Error("Invalid image");
    }
    await image.stats();
  } catch {
    throw new AuditError(
      400,
      "INVALID_IMAGE",
      "The screenshot is corrupt, mismatched, animated, or exceeds 25 megapixels. Choose a static PNG, JPEG, or WebP image.",
    );
  }
}

export function createApp(analyze: typeof analyzeImage = analyzeImage) {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (_request, response, next) => {
    response.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  app.get("/api/health", (_request, response) => {
    const { apiKey, model } = getConfig();
    response.json({ status: "ok", configured: Boolean(apiKey), model });
  });
  app.post(
    "/api/audit",
    upload.single("screenshot"),
    async (request, response) => {
      if (!request.file)
        throw new AuditError(
          400,
          "MISSING_IMAGE",
          "Select a screenshot before analyzing.",
        );
      const { buffer, mimetype } = request.file;
      await validateImage(buffer, mimetype);
      const controller = new AbortController();
      const cancel = () => {
        if (!response.writableEnded) controller.abort();
      };
      response.once("close", cancel);
      try {
        const result = await analyze(buffer, mimetype, controller.signal);
        response.json(auditSchema.parse(result));
      } finally {
        response.off("close", cancel);
      }
    },
  );
  app.use("/api", (_request, response) =>
    response
      .status(404)
      .json({
        error: { code: "NOT_FOUND", message: "API endpoint not found." },
      }),
  );
  const onError: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    _next,
  ) => {
    if (response.headersSent) return;
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      response.status(tooLarge ? 413 : 400).json({
        error: {
          code: tooLarge ? "IMAGE_TOO_LARGE" : "INVALID_UPLOAD",
          message:
            tooLarge ?
              "The screenshot exceeds the 5 MB upload limit."
            : "Upload exactly one screenshot file and no extra fields.",
        },
      });
      return;
    }
    const safe =
      error instanceof AuditError ? error : (
        new AuditError(
          500,
          "INTERNAL_ERROR",
          "The audit could not be completed. Please retry.",
        )
      );
    response
      .status(safe.status)
      .json({ error: { code: safe.code, message: safe.message } });
  };
  app.use(onError);
  return app;
}
