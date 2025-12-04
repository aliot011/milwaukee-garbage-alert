"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCityResponse = fetchCityResponse;
// src/cityClient.ts
const axios_1 = __importDefault(require("axios"));
// Base endpoint is the same for everyone
const BASE_URL = "https://itmdapps.milwaukee.gov/DpwServletsPublicAll/garbageDayService";
function buildGarbageUrl(params) {
    const qs = `redir=y&embed=y` +
        `&laddr=${encodeURIComponent(params.laddr)}` +
        `&sdir=${encodeURIComponent(params.sdir)}` +
        `&sname=${encodeURIComponent(params.sname)}` +
        `&stype=${encodeURIComponent(params.stype)}` +
        `&faddr=${encodeURIComponent(params.faddr)}` +
        `&method=na`;
    return `${BASE_URL}?${qs}`;
}
// Fetch raw JSON from city for a specific address
async function fetchCityResponse(address) {
    const url = buildGarbageUrl(address);
    const response = await axios_1.default.get(url, {
        headers: { Accept: "application/json" },
    });
    return response.data;
}
