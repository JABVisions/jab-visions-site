import assert from "node:assert/strict";
import {
  classifyBankingState,
  isBankingReadyForPayDrops,
  normalizeBankingSettings,
  parseAmountToCents,
} from "./status";

assert.equal(classifyBankingState({}), "not_connected");
assert.equal(
  classifyBankingState({
    stripeAccountId: "acct_1",
    detailsSubmitted: false,
  }),
  "setup_incomplete"
);
assert.equal(
  classifyBankingState({
    stripeAccountId: "acct_1",
    detailsSubmitted: true,
    chargesEnabled: true,
    payoutsEnabled: true,
  }),
  "payouts_enabled"
);
assert.equal(
  classifyBankingState({
    stripeAccountId: "acct_1",
    detailsSubmitted: true,
    chargesEnabled: true,
    payoutsEnabled: false,
    requirementsDue: ["individual.id_number"],
  }),
  "verification_required"
);
assert.equal(isBankingReadyForPayDrops("payouts_enabled"), true);
assert.equal(isBankingReadyForPayDrops("not_connected"), false);
assert.equal(parseAmountToCents("25.00"), 2500);
assert.equal(parseAmountToCents("$7.5"), 750);
assert.equal(parseAmountToCents("abc"), null);
assert.equal(normalizeBankingSettings({ defaultAmountCents: 1000, showOnProfile: false }).defaultAmountCents, 1000);
assert.equal(normalizeBankingSettings({}).payDropsEnabled, true);
console.log("banking status checks passed");
