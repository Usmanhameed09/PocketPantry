/**
 * Hardcoded test products for pricing module.
 * Each product has a Sam's Club product ID and our stored (vending) price.
 * In the future, these will come from the database.
 */

export interface StoredProduct {
  id: string;
  name: string;
  /** Our current vending machine price */
  vendingPrice: number;
  /** Previous supplier cost we have on file */
  lastKnownCost: number;
  /** Sam's Club product ID (from URL) */
  samsClubProductId: string;
  /** Sam's Club item number */
  samsClubItemNumber: string;
  /** Category for display */
  category: "beverage" | "snack";
}

export const testProducts: StoredProduct[] = [
  {
    id: "PR-001",
    name: "Celsius Sparkling Energy Drink Variety Pack",
    vendingPrice: 3.50,
    lastKnownCost: 1.20,
    samsClubProductId: "celsius-sparkling-energy-drink-variety-pack-18-ct",
    samsClubItemNumber: "980269043",
    category: "beverage",
  },
  {
    id: "PR-002",
    name: "Monster Energy Drink Variety Pack",
    vendingPrice: 3.00,
    lastKnownCost: 1.50,
    samsClubProductId: "monster-energy-drink-variety-pack-16-fl-oz-24-pk",
    samsClubItemNumber: "980063618",
    category: "beverage",
  },
  {
    id: "PR-003",
    name: "Red Bull Energy Drink",
    vendingPrice: 3.50,
    lastKnownCost: 1.75,
    samsClubProductId: "red-bull-energy-drink-12-fl-oz-24-pk",
    samsClubItemNumber: "980195498",
    category: "beverage",
  },
  {
    id: "PR-004",
    name: "OREO Chocolate Sandwich Cookies",
    vendingPrice: 1.50,
    lastKnownCost: 0.65,
    samsClubProductId: "oreo-chocolate-sandwich-cookies",
    samsClubItemNumber: "980044508",
    category: "snack",
  },
  {
    id: "PR-005",
    name: "Snickers Variety Pack",
    vendingPrice: 1.75,
    lastKnownCost: 0.70,
    samsClubProductId: "snickers-variety-pack",
    samsClubItemNumber: "980196693",
    category: "snack",
  },
  {
    id: "PR-006",
    name: "Frito-Lay Bold Mix Variety Pack",
    vendingPrice: 1.50,
    lastKnownCost: 0.80,
    samsClubProductId: "frito-lay-bold-mix-variety-pack-50-ct",
    samsClubItemNumber: "980196316",
    category: "snack",
  },
];
