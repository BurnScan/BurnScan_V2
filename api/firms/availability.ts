import { availabilityResponse } from "../../src/server/firmsProxy.js";

export async function GET() {
  return availabilityResponse();
}
