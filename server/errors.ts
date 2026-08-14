/** Stable API error payloads — UI maps `code` through i18n. */
export type ApiErrBody = {
  error: string;
  code: string;
  stock?: string;
  need?: string;
  have?: string;
  itemId?: string;
};

export const ERR = {
  notFound: { error: "not_found", code: "not_found" } satisfies ApiErrBody,
  noRecipe: { error: "no_recipe", code: "no_recipe" } satisfies ApiErrBody,
  invalidUnit: {
    error: "invalid_unit",
    code: "invalid_unit",
  } satisfies ApiErrBody,
  categoryRequired: {
    error: "category_required",
    code: "category_required",
  } satisfies ApiErrBody,
  ingredientInUse: {
    error: "ingredient_in_use",
    code: "ingredient_in_use",
  } satisfies ApiErrBody,
  productInUse: {
    error: "product_in_use",
    code: "product_in_use",
  } satisfies ApiErrBody,
  resaleInUse: {
    error: "resale_in_use",
    code: "resale_in_use",
  } satisfies ApiErrBody,
  invalidId: { error: "invalid_id", code: "invalid_id" } satisfies ApiErrBody,
  invalidRequest: {
    error: "invalid_request",
    code: "invalid_request",
  } satisfies ApiErrBody,
  invalidQuery: {
    error: "invalid_query",
    code: "invalid_query",
  } satisfies ApiErrBody,
  invalidProductOrIngredient: {
    error: "invalid_product_or_ingredient",
    code: "invalid_product_or_ingredient",
  } satisfies ApiErrBody,
  employeeNotFound: {
    error: "employee_not_found",
    code: "employee_not_found",
  } satisfies ApiErrBody,
  employeeInactive: {
    error: "employee_inactive",
    code: "employee_inactive",
  } satisfies ApiErrBody,
  failedProduction: {
    error: "failed_production",
    code: "failed_production",
  } satisfies ApiErrBody,
  tooManyRequests: {
    error: "too_many_requests",
    code: "too_many_requests",
  } satisfies ApiErrBody,
  unknownExport: {
    error: "unknown_export",
    code: "unknown_export",
  } satisfies ApiErrBody,
  unauthorized: {
    error: "unauthorized",
    code: "unauthorized",
  } satisfies ApiErrBody,
  serverError: {
    error: "server_error",
    code: "server_error",
  } satisfies ApiErrBody,
  payloadTooLarge: {
    error: "payload_too_large",
    code: "payload_too_large",
  } satisfies ApiErrBody,
  timeout: {
    error: "timeout",
    code: "timeout",
  } satisfies ApiErrBody,
  misconfigured: {
    error: "misconfigured",
    code: "misconfigured",
  } satisfies ApiErrBody,
};

export function insufficientStock(stock: string): ApiErrBody {
  return { error: "insufficient_stock", code: "insufficient_stock", stock };
}

export function insufficientStockNeed(
  itemId: string,
  need: string,
  have: string,
): ApiErrBody {
  return {
    error: "insufficient_stock_need",
    code: "insufficient_stock_need",
    itemId,
    need,
    have,
  };
}
