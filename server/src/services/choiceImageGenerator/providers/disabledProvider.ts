import type { ChoiceImageGenerator, ChoiceImageRequest } from "../types.js";

export class DisabledChoiceImageProvider implements ChoiceImageGenerator {
  readonly name = "disabled" as const;

  async generate(_request: ChoiceImageRequest): Promise<null> {
    return null;
  }
}
