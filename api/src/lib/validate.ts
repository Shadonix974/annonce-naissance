import type { ZodSchema } from "zod";
import { zValidator as honoZValidator } from "@hono/zod-validator";
import { ValidationError } from "./errors.js";

type Target = "json" | "form" | "query" | "param" | "header" | "cookie";

export function zValidator<T extends ZodSchema>(target: Target, schema: T) {
  return honoZValidator(target, schema, (result) => {
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new ValidationError("invalid_input", message);
    }
  });
}
