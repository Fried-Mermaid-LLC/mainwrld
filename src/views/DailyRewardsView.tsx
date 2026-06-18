import { MAX_DAILY_EARNED_POINTS } from "@/config/constants";
import { Button } from "@/components/sharedComponents";
import type { Coupon } from "@/types";
import * as iap from "@/services/iap";
import {
  STRIPE_PAYMENT_LINKS,
  STRIPE_PREMIUM_PAYMENT_LINK,
} from "@/config/config";
import { useApp } from "@/state/AppContext";

export const DailyRewardsView = () => {
  const {
    setView,
    showToast,
    user,
    firebaseUid,
    coupons,
    handleClaimPoints,
    handleSpinWheel,
  } = useApp();
  return (
    <div className="fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in fade-in duration-500 z-[400]">
      <header className="p-6 flex items-center gap-4 sticky top-0 bg-white/80 backdrop-blur-xl z-50">
        <button
          onClick={() => setView("home")}
          className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400"
        >
          <span className="material-icons-round">arrow_back</span>
        </button>
        <h1 className="text-xl font-bold">Daily Rewards</h1>
      </header>
      <div className="p-8 flex flex-col items-center gap-10">
        <div className="text-center space-y-2">
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
            Your Points
          </p>
          <h2 className="text-5xl font-display text-accent">{user.points}</h2>
        </div>

        {/* Daily Earned Points Progress */}
        {(() => {
          const now = Date.now();
          const isNewDay =
            !user.lastPointsReset ||
            now - (user.lastPointsReset || 0) > 24 * 60 * 60 * 1000;
          const earned = isNewDay ? 0 : user.dailyEarnedPoints || 0;
          const pct = Math.min(100, (earned / MAX_DAILY_EARNED_POINTS) * 100);
          return (
            <div className="w-full px-2">
              <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  Today's Earned Points
                </p>
                <p className="text-sm font-bold text-accent">
                  {earned}/{MAX_DAILY_EARNED_POINTS}
                </p>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {earned >= MAX_DAILY_EARNED_POINTS && (
                <p className="text-[10px] text-accent font-bold mt-1 text-center">
                  Daily cap reached! Come back tomorrow.
                </p>
              )}
            </div>
          );
        })()}

        <div className="w-full space-y-8">
          <div className="p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 flex flex-col items-center gap-6 shadow-sm">
            <div className="text-center">
              <h3 className="text-lg font-bold">Daily 3 Points</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                Claim every 24 hours
              </p>
            </div>
            <Button className="w-full h-16" onClick={handleClaimPoints}>
              Claim Points
            </Button>
          </div>

          <div className="p-8 bg-black rounded-[2.5rem] border border-gray-800 flex flex-col items-center gap-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"></div>
            <div className="text-center relative z-10">
              <h3 className="text-lg font-bold text-white">Coupon Kiosk</h3>
              <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest">
                150 Points to win a coupon
              </p>
            </div>
            <div className="w-32 h-32 rounded-full border-4 border-dashed border-accent flex items-center justify-center relative z-10 animate-[spin_10s_linear_infinite]">
              <span className="material-icons-round text-5xl text-accent">
                auto_awesome
              </span>
            </div>
            <Button
              variant="primary"
              className="w-full h-16 relative z-10"
              onClick={handleSpinWheel}
            >
              {" "}
              Win a $1, $3, $5, or $10 Coupon
            </Button>
            <p className="text-[8px] text-white/30 font-bold uppercase tracking-widest text-center mt-2">
              Win coupons for your next book purchase
            </p>
          </div>

          {/* Purchase Points Section */}
          <div className="p-8 bg-white rounded-[2.5rem] border border-gray-100 flex flex-col items-center gap-6 shadow-sm">
            <div className="text-center">
              <h3 className="text-lg font-bold">Purchase Points</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                Get points instantly
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full">
              {[
                { usd: 0.99, pts: 100 },
                { usd: 2.99, pts: 300 },
                { usd: 4.99, pts: 500 },
                { usd: 9.99, pts: 1000 },
              ].map((pkg) => (
                <button
                  key={pkg.pts}
                  onClick={async () => {
                    // On iOS go through Apple IAP (App Store 3.1.1).
                    // The credit happens server-side after Apple
                    // approves the transaction; see iap.setVerifyCallback
                    // wired in the App useEffect above.
                    if (iap.isNativeIAPAvailable()) {
                      try {
                        await iap.purchase(`points_${pkg.pts}` as iap.IapSku);
                      } catch (err: any) {
                        console.error("[MainWRLD IAP] purchase failed:", err);
                        showToast(err?.message || "Purchase failed.", "error");
                      }
                      return;
                    }

                    // Web path: Stripe Checkout link. client_reference_id
                    // carries the firebaseUid through to the webhook (the
                    // server credit needs to know which user paid).
                    if (!firebaseUid) {
                      showToast("Please sign in before purchasing.", "error");
                      return;
                    }
                    localStorage.setItem(
                      "mainwrld_pending_points",
                      JSON.stringify({
                        pts: pkg.pts,
                        usd: pkg.usd,
                        timestamp: Date.now(),
                      }),
                    );
                    window.location.href =
                      STRIPE_PAYMENT_LINKS[`points_${pkg.pts}`] +
                      `?client_reference_id=${firebaseUid}`;
                  }}
                  className="p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white hover:border-accent transition-all flex flex-col items-center gap-1 group active:scale-95"
                >
                  <span className="text-lg font-black text-accent">
                    {pkg.pts}
                  </span>
                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                    Points
                  </span>
                  <div className="mt-2 px-3 py-1 bg-accent text-white rounded-lg text-[10px] font-bold">
                    ${pkg.usd}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Premium Membership */}
        <div className="w-full">
          <div className="p-8 bg-gradient-to-br from-amber-50 to-orange-50 rounded-[2.5rem] border border-amber-200 flex flex-col items-center gap-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <span className="material-icons-round text-pink-300 text-4xl">
                workspace_premium
              </span>
            </div>
            <div className="text-center relative z-10">
              <h3 className="text-lg font-bold text-amber-900">MainWRLD+</h3>
              <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">
                {user.isPremium ? "Active Subscription" : "$34.99 a year"}
              </p>
            </div>

            {/* HERE */}

            {user.isPremium ? (
              <div className="w-full space-y-3">
                <div className="flex items-center gap-2 text-amber-700">
                  <span className="material-icons-round text-sm">
                    check_circle
                  </span>
                  <span className="text-xs font-bold">No More Ads</span>
                </div>
                <div className="flex items-center gap-2 text-amber-700">
                  <span className="material-icons-round text-sm">
                    check_circle
                  </span>
                  <span className="text-xs font-bold">
                    2x daily points (6 pts/day)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-amber-700">
                  <span className="material-icons-round text-sm">
                    check_circle
                  </span>
                  <span className="text-xs font-bold">
                    Compete in MainWRLD book contests
                  </span>
                </div>
                <div className="flex items-center gap-2 text-amber-700">
                  <span className="material-icons-round text-sm">
                    check_circle
                  </span>
                  <span className="text-xs font-bold">
                    Save Chat Messages Forever
                  </span>
                </div>
                <div className="flex items-center gap-2 text-amber-700">
                  <span className="material-icons-round text-sm">
                    check_circle
                  </span>
                  <span className="text-xs font-bold">
                    Annual 200 Point Bonus
                  </span>
                </div>
                <div className="pt-3 text-center">
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">
                    Member since{" "}
                    {user.premiumSince
                      ? new Date(user.premiumSince).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            year: "numeric",
                          },
                        )
                      : "today"}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="w-full space-y-3">
                  <div className="flex items-center gap-2 text-amber-700">
                    <span className="material-icons-round text-sm">
                      auto_awesome
                    </span>
                    <span className="text-xs font-bold">No More Ads</span>
                  </div>
                  <div className="flex items-center gap-2 text-amber-700">
                    <span className="material-icons-round text-sm">
                      auto_awesome
                    </span>
                    <span className="text-xs font-bold">
                      2x daily points (6 pts/day)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-amber-700">
                    <span className="material-icons-round text-sm">
                      auto_awesome
                    </span>
                    <span className="text-xs font-bold">
                      Compete in MainWRLD book contests
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-amber-700">
                    <span className="material-icons-round text-sm">
                      auto_awesome
                    </span>
                    <span className="text-xs font-bold">
                      Save Chat Messages Forever
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-amber-700">
                    <span className="material-icons-round text-sm">
                      auto_awesome
                    </span>
                    <span className="text-xs font-bold">
                      Annual 200 Point Bonus
                    </span>
                  </div>
                </div>
                <Button
                  className="w-full h-16 bg-amber-500 hover:bg-amber-600"
                  onClick={async () => {
                    // iOS: Apple IAP subscription. The credit (set
                    // isPremium=true) happens server-side via the
                    // verifyAppleReceipt callback wired in App.
                    if (iap.isNativeIAPAvailable()) {
                      try {
                        await iap.purchase("premium_yearly");
                      } catch (err: any) {
                        console.error(
                          "[MainWRLD IAP] premium purchase failed:",
                          err,
                        );
                        showToast(
                          err?.message || "Subscription failed.",
                          "error",
                        );
                      }
                      return;
                    }
                    if (!firebaseUid) {
                      showToast("Please sign in before subscribing.", "error");
                      return;
                    }
                    localStorage.setItem(
                      "mainwrld_pending_premium",
                      JSON.stringify({ timestamp: Date.now() }),
                    );
                    window.location.href =
                      STRIPE_PREMIUM_PAYMENT_LINK +
                      `?client_reference_id=${firebaseUid}`;
                  }}
                >
                  Subscribe — $34.99/yr
                </Button>
                <p className="text-[8px] text-amber-400 text-center font-bold uppercase tracking-widest">
                  Cancel anytime
                </p>
              </>
            )}
          </div>
        </div>

        {/* Coupon Slots UI */}
        <div className="w-full space-y-6">
          {(() => {
            const unusedCoupons = coupons.filter((c: Coupon) => !c.used);
            // The wheel fills up to 3 slots, but purchased coupons (buy_* id)
            // stack beyond that — so grow the grid in full rows of 3 instead
            // of showing a misleading "4/3". A future spin only ever cycles
            // out the oldest WON coupon, so that is the one we flag.
            const slotCount = Math.max(
              3,
              Math.ceil(unusedCoupons.length / 3) * 3,
            );
            const oldestWonId = unusedCoupons.find(
              (c: Coupon) => !c.id.startsWith("buy_"),
            )?.id;
            return (
              <>
                <div className="flex justify-between items-end px-4">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Coupon Slots
                  </h3>
                  <span className="text-[10px] font-bold text-accent">
                    {unusedCoupons.length}{" "}
                    {unusedCoupons.length === 1 ? "Coupon" : "Coupons"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {Array.from({ length: slotCount }).map((_, slotIdx) => {
                    const coupon = unusedCoupons[slotIdx];
                    return (
                      <div
                        key={slotIdx}
                        className={`aspect-square rounded-[1.8rem] border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                          coupon
                            ? "bg-accent/5 border-accent shadow-lg shadow-accent/10"
                            : "bg-gray-50 border-dashed border-gray-200 opacity-50"
                        }`}
                      >
                        {coupon ? (
                          <>
                            <span className="material-icons-round text-accent text-xl">
                              confirmation_number
                            </span>
                            <span className="text-lg font-black text-accent">
                              ${coupon.value}
                            </span>
                            <span className="text-[7px] font-bold text-accent/60 uppercase tracking-tighter">
                              Off
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="material-icons-round text-gray-300">
                              lock_open
                            </span>
                            <span className="text-[8px] font-bold text-gray-300 uppercase">
                              Empty
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {unusedCoupons.length > 0 && (
                  <div className="space-y-3 mt-8">
                    <h4 className="text-[9px] font-bold text-gray-300 uppercase tracking-[0.2em] px-4">
                      Inventory Details
                    </h4>
                    {unusedCoupons.map((c, idx) => {
                      const isPurchased = c.id.startsWith("buy_");
                      const isNext = c.id === oldestWonId;
                      return (
                        <div
                          key={c.id}
                          className="p-5 bg-gray-50 border border-gray-100 rounded-2xl flex justify-between items-center animate-in slide-in-from-right duration-300"
                          style={{ animationDelay: `${idx * 100}ms` }}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                isNext
                                  ? "bg-red-50 text-red-500"
                                  : "bg-accent/10 text-accent"
                              }`}
                            >
                              <span className="material-icons-round text-sm">
                                {isNext ? "history" : "local_offer"}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-black">
                                ${c.value} Off Discount
                              </p>
                              <p className="text-[8px] font-bold text-gray-400 uppercase">
                                {isPurchased
                                  ? "Purchased"
                                  : isNext
                                  ? "Cycled out next"
                                  : "Won"}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-accent uppercase tracking-widest">
                            Unused
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
