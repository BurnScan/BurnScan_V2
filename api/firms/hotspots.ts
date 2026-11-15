import { hotspotsResponse } from "../../src/server/firmsProxy.js";

export async function GET(request: Request) {
  return hotspotsResponse(request);
}
