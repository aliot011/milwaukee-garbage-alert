// src/cityClient.ts
import axios from "axios";

export interface AddressParams {
  laddr: string; // house number, e.g. "1403"
  sdir: string; // street direction, e.g. "E"
  sname: string; // street name, e.g. "POTTER"
  stype: string; // street type, e.g. "AV"
  faddr: string; // full address, e.g. "1403 E POTTER AV"
}

export interface CityPickup {
  date: string;
  alt_date: string;
  is_determined: boolean;
  is_guaranteed: boolean;
  is_winter: boolean;
  route: string;
  apt_garbage_acct_num: string;
  year: number;
}

export interface CityResponse {
  success: boolean;
  garbage?: CityPickup;
  recycling?: CityPickup;
}

const BASE_URL =
  "https://itmdapps.milwaukee.gov/DpwServletsPublicAll/garbageDayService";

// 🔹 NEW: normalize everything to UPPERCASE (except laddr)
function normalizeAddress(params: AddressParams): AddressParams {
  return {
    laddr: params.laddr.trim(), // keep as-is
    sdir: params.sdir.trim().toUpperCase(), // "e" -> "E"
    sname: params.sname.trim().toUpperCase(), // "Potter" -> "POTTER"
    stype: params.stype.trim().toUpperCase(), // "av" -> "AV"
    faddr: params.faddr.trim().toUpperCase(), // full address uppercased
  };
}

function buildGarbageUrl(params: AddressParams): string {
  const p = normalizeAddress(params);

  const qs =
    `redir=y&embed=y` +
    `&laddr=${encodeURIComponent(p.laddr)}` +
    `&sdir=${encodeURIComponent(p.sdir)}` +
    `&sname=${encodeURIComponent(p.sname)}` +
    `&stype=${encodeURIComponent(p.stype)}` +
    `&faddr=${encodeURIComponent(p.faddr)}` +
    `&method=na`;

  return `${BASE_URL}?${qs}`;
}

export async function fetchCityResponse(
  address: AddressParams
): Promise<CityResponse> {
  const url = buildGarbageUrl(address);
  const response = await axios.get<CityResponse>(url, {
    headers: { Accept: "application/json" },
  });
  return response.data;
}
