import { statusResponse } from "../../src/server/firmsProxy.js";

export async function GET() {
  return statusResponse();
}
