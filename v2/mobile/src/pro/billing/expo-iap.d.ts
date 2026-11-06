/**
 * Tipos mínimos de expo-iap 5.0.x que usa Franky Pro. El paquete puede no
 * estar instalado en node_modules (Expo Go, web o una copia compartida), así
 * que iap.ts lo carga con require dentro de try/catch y lo tipa con esto en
 * vez de importar "expo-iap". Solo lo necesario, con los mismos nombres que
 * la librería (build/types.d.ts).
 */

export type IapPurchaseState = "pending" | "purchased" | "unknown";

export type IapProduct = {
  id: string;
  /** Precio ya formateado por la App Store en la moneda del usuario. */
  displayPrice: string;
  price?: number | null;
  currency?: string;
  title?: string;
};

export type IapPurchase = {
  id: string;
  productId: string;
  purchaseState?: IapPurchaseState;
  /** En iOS es la transacción firmada de StoreKit 2 (JWS). */
  purchaseToken?: string | null;
  transactionDate?: number;
  appAccountToken?: string | null;
  expirationDateIOS?: number | null;
};

export type IapError = { code?: string; message?: string; productId?: string | null };

export type IapSubscription = { remove(): void };

export interface ExpoIapModule {
  initConnection(config?: null): Promise<boolean>;
  endConnection(): Promise<boolean>;
  fetchProducts(request: { skus: string[]; type?: "in-app" | "subs" | "all" }): Promise<IapProduct[] | null>;
  requestPurchase(args: {
    type: "subs";
    request: { apple?: { sku: string; appAccountToken?: string | null; andDangerouslyFinishTransactionAutomatically?: boolean | null } };
  }): Promise<IapPurchase | IapPurchase[] | null>;
  finishTransaction(args: { purchase: IapPurchase; isConsumable?: boolean | null }): Promise<void>;
  getAvailablePurchases(options?: { onlyIncludeActiveItemsIOS?: boolean | null; alsoPublishToEventListenerIOS?: boolean | null }): Promise<IapPurchase[]>;
  restorePurchases(): Promise<void>;
  purchaseUpdatedListener(listener: (purchase: IapPurchase) => void): IapSubscription;
  purchaseErrorListener(listener: (error: IapError) => void): IapSubscription;
  getTransactionJwsIOS?(sku: string): Promise<string | null>;
  deepLinkToSubscriptionsIOS?(): Promise<void>;
}
