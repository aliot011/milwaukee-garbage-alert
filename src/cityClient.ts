// src/cityClient.ts
import axios from "axios";

export interface AddressParams {
  laddr: string;
  sdir: string;
  sname: string;
  stype: string;
  faddr: string;
}

export interface CityPickup {
  date: string;
  route: string;
  apt_garbage_acct_num: string;
  year: number;
  is_determined: boolean;
  alt_date: string;
  is_guaranteed: boolean;
  is_winter: boolean;
}

export interface CityResponse {
  success: boolean;
  garbage?: CityPickup;
  recycling?: CityPickup;
}

export async function fetchCityResponse(
  address: AddressParams
): Promise<CityResponse> {
  const { laddr, sdir, sname, stype, faddr } = address;

  const params = new URLSearchParams({
    redir: "y",
    embed: "y",
    laddr: laddr.trim(),
    sdir: (sdir || "").toUpperCase().trim(),
    sname: sname.toUpperCase().trim(),
    stype: stype.toUpperCase().trim(),
    faddr: faddr.toUpperCase().trim(),
    method: "na",
  });

  const url =
    "https://itmdapps.milwaukee.gov/DpwServletsPublicAll/garbageDayService?" +
    params.toString();

  console.log("[cityClient] calling URL:", url);

  const res = await axios.get(url, { timeout: 5000 });

  if (res.status !== 200) {
    throw new Error(`City API returned status ${res.status}`);
  }

  // Log raw data so we can see what the city sends back
  console.log("[cityClient] raw data:", res.data);

  return res.data as CityResponse;
}
