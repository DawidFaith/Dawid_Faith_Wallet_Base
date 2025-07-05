// Zentrale Balance-Utilities für alle Wallet-Tabs

export const TOKEN_ADDRESSES = {
  DFAITH: "0xeB6f60E08AaAd7951896BdefC65cB789633BbeAd", // D.FAITH auf Base (NEU Juli 2025)
  DINVEST: "0x9D7a06c24F114f987d8C08f0fc8Aa422910F3902", // D.INVEST auf Base (NEU Juli 2025)
  ETH: "0x0000000000000000000000000000000000000000", // Native ETH
  NATIVE_ETH: "0x0000000000000000000000000000000000000000" // Native ETH
};

export const TOKEN_DECIMALS = {
  DFAITH: 2,
  DINVEST: 0,
  ETH: 18
};

// Zentrale API-Funktion für Token Balance Abfrage via Thirdweb Insight API
export const fetchTokenBalanceViaInsightApi = async (
  tokenAddress: string,
  accountAddress: string
): Promise<string> => {
  if (!accountAddress) return "0";
  
  try {
    const params = new URLSearchParams({
      chain_id: "8453", // Base Chain ID
      token_address: tokenAddress,
      owner_address: accountAddress,
      include_native: "true",
      resolve_metadata_links: "true",
      include_spam: "false",
      limit: "50",
      metadata: "false",
    });
    
    const url = `https://insight.thirdweb.com/v1/tokens?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-client-id": process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || "",
      },
    });
    
    if (!res.ok) {
      console.error("Insight API Fehlerstatus:", res.status, res.statusText);
      throw new Error(`API Error: ${res.status}`);
    }
    
    const data = await res.json();
    const balance = data?.data?.[0]?.balance ?? "0";
    return balance;
  } catch (error) {
    console.error("Insight API Fehler:", error);
    return "0";
  }
};

// Formatiere D.FAITH Balance (2 Dezimalstellen)
export const formatDfaithBalance = (rawBalance: string): string => {
  const raw = Number(rawBalance);
  return (raw / Math.pow(10, TOKEN_DECIMALS.DFAITH)).toFixed(TOKEN_DECIMALS.DFAITH);
};

// Formatiere D.INVEST Balance (0 Dezimalstellen)
export const formatDinvestBalance = (rawBalance: string): string => {
  return Math.floor(Number(rawBalance)).toString();
};

// Native ETH Balance via RPC auf Base
export const fetchNativeEthBalance = async (accountAddress: string): Promise<string> => {
  if (!accountAddress) return "0.0000";
  
  try {
    const response = await fetch('https://mainnet.base.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [accountAddress, 'latest'],
        id: 1
      })
    });
    
    if (!response.ok) {
      throw new Error(`RPC Error: ${response.status}`);
    }
    
    const data = await response.json();
    const balance = BigInt(data.result);
    const ethFormatted = Number(balance) / Math.pow(10, TOKEN_DECIMALS.ETH);
    return ethFormatted.toFixed(4);
  } catch (error) {
    console.error("Fehler beim Laden der ETH Balance:", error);
    return "0.0000";
  }
};

// Verbesserte Preise mit Fallback-System
export const fetchPricesWithFallback = async () => {
  // Lade gespeicherte Preise
  const loadStoredPrices = () => {
    try {
      const stored = localStorage.getItem('dawid_faith_prices');
      if (stored) {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        // Verwende gespeicherte Preise wenn sie weniger als 6 Stunden alt sind
        if (parsed.timestamp && (now - parsed.timestamp) < 6 * 60 * 60 * 1000) {
          return parsed;
        }
      }
    } catch (e) {
      console.log('Fehler beim Laden gespeicherter Preise:', e);
    }
    return null;
  };

  const storedPrices = loadStoredPrices();
  let ethEur = storedPrices?.ethEur || 3000; // Fallback-Werte
  let dfaithEur = storedPrices?.dfaithEur || 0.001;

  try {
    // Versuche CoinGecko für ETH Preis
    const ethResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=eur');
    if (ethResponse.ok) {
      const ethData = await ethResponse.json();
      const newEthEur = ethData['ethereum']?.eur;
      if (newEthEur) {
        ethEur = Math.round(newEthEur * 100) / 100;
      }
    } else if (ethResponse.status === 429) {
      console.log('CoinGecko Rate Limit erreicht (429), verwende gespeicherte Preise');
    }
  } catch (e) {
    console.log('CoinGecko Fehler, verwende Fallback:', e);
  }

  try {
    // Versuche OpenOcean für D.FAITH Preis auf Base
    const params = new URLSearchParams({
      chain: "base",
      inTokenAddress: TOKEN_ADDRESSES.NATIVE_ETH,
      outTokenAddress: TOKEN_ADDRESSES.DFAITH,
      amount: "1",
      gasPrice: "50",
    });
    
    const response = await fetch(`https://open-api.openocean.finance/v3/base/quote?${params}`);
    
    if (response.ok) {
      const data = await response.json();
      if (data?.data?.outAmount && data.data.outAmount !== "0") {
        const dfaithPerEth = Number(data.data.outAmount) / Math.pow(10, TOKEN_DECIMALS.DFAITH);
        dfaithEur = ethEur / dfaithPerEth;
      }
    }
  } catch (e) {
    console.log("OpenOcean Fehler, verwende Fallback:", e);
  }

  // Speichere neue Preise
  try {
    const newPrices = {
      dfaithEur,
      ethEur,
      timestamp: Date.now()
    };
    localStorage.setItem('dawid_faith_prices', JSON.stringify(newPrices));
  } catch (e) {
    console.log('Fehler beim Speichern der Preise:', e);
  }

  return { dfaithEur, ethEur };
};

// Alle Balances auf einmal laden
export const fetchAllBalances = async (accountAddress: string) => {
  if (!accountAddress) {
    return {
      dfaith: "0.00",
      dinvest: "0",
      eth: "0.0000"
    };
  }

  try {
    const [dfaithRaw, dinvestRaw, ethBalance] = await Promise.all([
      fetchTokenBalanceViaInsightApi(TOKEN_ADDRESSES.DFAITH, accountAddress),
      fetchTokenBalanceViaInsightApi(TOKEN_ADDRESSES.DINVEST, accountAddress),
      fetchNativeEthBalance(accountAddress)
    ]);

    return {
      dfaith: formatDfaithBalance(dfaithRaw),
      dinvest: formatDinvestBalance(dinvestRaw),
      eth: ethBalance
    };
  } catch (error) {
    console.error("Fehler beim Laden aller Balances:", error);
    return {
      dfaith: "0.00",
      dinvest: "0",
      eth: "0.0000"
    };
  }
};
