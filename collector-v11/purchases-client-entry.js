import { Purchases } from '@revenuecat/purchases-capacitor';

if (typeof window !== 'undefined') {
  window.CollectorPurchasesBundle = Object.freeze({
    configure: ({ apiKey, appUserID }) => Purchases.configure({ apiKey, appUserID }),
    isConfigured: () => Purchases.isConfigured(),
    logIn: ({ appUserID }) => Purchases.logIn({ appUserID }),
    logOut: () => Purchases.logOut(),
    getOfferings: () => Purchases.getOfferings(),
    getCustomerInfo: () => Purchases.getCustomerInfo(),
    purchasePackage: ({ aPackage }) => Purchases.purchasePackage({ aPackage }),
    restorePurchases: () => Purchases.restorePurchases()
  });
}
