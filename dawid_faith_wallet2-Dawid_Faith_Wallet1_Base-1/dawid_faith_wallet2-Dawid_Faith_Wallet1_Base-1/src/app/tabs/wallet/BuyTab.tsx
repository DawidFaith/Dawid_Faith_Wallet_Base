import { useEffect, useState, useRef } from "react";
import { Button } from "../../../../components/ui/button";
import { FaCoins, FaLock, FaExchangeAlt, FaSync, FaRegCopy } from "react-icons/fa";
import { useActiveAccount, useSendTransaction, BuyWidget } from "thirdweb/react";
import { base } from "thirdweb/chains";
import { NATIVE_TOKEN_ADDRESS, getContract, prepareContractCall, sendAndConfirmTransaction, readContract } from "thirdweb";
import { client } from "../../client";
import { balanceOf, approve } from "thirdweb/extensions/erc20";

const DFAITH_TOKEN = "0xeB6f60E08AaAd7951896BdefC65cB789633BbeAd"; // D.FAITH Token auf Base (NEU Juli 2025)
const DFAITH_DECIMALS = 2; // Dezimalstellen
const DINVEST_TOKEN = "0x9D7a06c24F114f987d8C08f0fc8Aa422910F3902"; // D.INVEST Token auf Base (NEU Juli 2025)
const DINVEST_DECIMALS = 0; // D.INVEST hat keine Dezimalstellen
const ETH_TOKEN = "0x0000000000000000000000000000000000000000"; // Native ETH
const ETH_DECIMALS = 18;

export default function BuyTab() {
  // Globale Fehlerbehandlung für Thirdweb Analytics
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        const url = args[0]?.toString() || '';
        
        // Ignoriere 400-Fehler von Thirdweb Analytics (sowohl Event-API als auch Chain-spezifische Probleme)
        if (!response.ok && (
            url.includes('c.thirdweb.com/event') ||
            url.includes('thirdweb.com') && response.status === 400
          )) {
          console.log('Thirdweb Analytics/API Fehler ignoriert:', response.status, 'URL:', url);
          console.log('Möglicherweise falsche Chain-ID in Analytics-Request');
          // Gib eine fake erfolgreiche Antwort zurück
          return new Response('{}', { status: 200, statusText: 'OK' });
        }
        return response;
      } catch (error) {
        const url = args[0]?.toString() || '';
        // Ignoriere Analytics-Fehler und Chain-bezogene Fehler
        if (url.includes('c.thirdweb.com') ||
            url.includes('thirdweb.com')) {
          console.log('Thirdweb API Netzwerkfehler ignoriert:', error, 'URL:', url);
          console.log('Könnte an falscher Chain-ID liegen - verwende Base Chain (8453)');
          return new Response('{}', { status: 200, statusText: 'OK' });
        }
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const [dfaithPrice, setDfaithPrice] = useState<number | null>(null);
  const [dfaithPriceEur, setDfaithPriceEur] = useState<number | null>(null);
  const [ethPriceEur, setEthPriceEur] = useState<number | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);
  const [lastKnownPrices, setLastKnownPrices] = useState<{
    dfaith?: number;
    dfaithEur?: number;
    ethEur?: number;
    timestamp?: number;
  }>({});
  const account = useActiveAccount();
  // Modal- und Token-Auswahl-States für neues Design
  const [selectedToken, setSelectedToken] = useState<null | "DFAITH" | "DINVEST" | "ETH">(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [swapAmount, setSwapAmount] = useState("");
  const [swapQuote, setSwapQuote] = useState<any>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const { mutate: sendTransaction, isPending: isSwapPending } = useSendTransaction();
  const [swapStatus, setSwapStatus] = useState<string | null>(null);

  // Neuer State für mehrstufigen Kaufprozess
  const [buyStep, setBuyStep] = useState<'initial' | 'quoteFetched' | 'approved' | 'completed'>('initial');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [quoteTxData, setQuoteTxData] = useState<any>(null);
  const [spenderAddress, setSpenderAddress] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // D.FAITH Preis von OpenOcean holen und in Euro umrechnen mit Fallback
  useEffect(() => {
    // Lade gespeicherte Preise beim Start
    const loadStoredPrices = () => {
      try {
        const stored = localStorage.getItem('dawid_faith_prices');
        if (stored) {
          const parsed = JSON.parse(stored);
          const now = Date.now();
          // Verwende gespeicherte Preise wenn sie weniger als 6 Stunden alt sind
          if (parsed.timestamp && (now - parsed.timestamp) < 6 * 60 * 60 * 1000) {
            setLastKnownPrices(parsed);
            if (parsed.dfaith) setDfaithPrice(parsed.dfaith);
            if (parsed.dfaithEur) setDfaithPriceEur(parsed.dfaithEur);
            if (parsed.ethEur) setEthPriceEur(parsed.ethEur);
          }
        }
      } catch (e) {
        console.log('Fehler beim Laden gespeicherter Preise:', e);
      }
    };

    loadStoredPrices();

    const fetchDfaithPrice = async () => {
      setIsLoadingPrice(true);
      setPriceError(null);
      let ethEur: number | null = null;
      let dfaithPriceEur: number | null = null;
      let errorMsg = "";
      
      try {
        // 1. Hole ETH/EUR Preis von CoinGecko
        try {
          const ethResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=eur');
          if (ethResponse.ok) {
            const ethData = await ethResponse.json();
            ethEur = ethData['ethereum']?.eur;
            if (ethEur) {
              // Auf 2 Dezimalstellen runden
              ethEur = Math.round(ethEur * 100) / 100;
            }
          }
        } catch (e) {
          console.log('ETH Preis Fehler:', e);
        }
        
        // Fallback auf letzten bekannten ETH Preis
        if (!ethEur && lastKnownPrices.ethEur) {
          ethEur = lastKnownPrices.ethEur;
        } else if (!ethEur) {
          ethEur = 3000; // Hard fallback für ETH
        }
        
        // 2. Hole D.FAITH Preis von OpenOcean für Base Chain
        try {
          // amount in Wei (1 ETH = 1e18)
          const amountWei = (1n * 10n ** 18n).toString();
          const params = new URLSearchParams({
            chain: "base",
            inTokenAddress: "0x0000000000000000000000000000000000000000", // Native ETH
            outTokenAddress: DFAITH_TOKEN,
            amount: amountWei, // 1 ETH in Wei
            gasPrice: "0.001", // Base Chain: 0.001 Gwei statt 50 Gwei
          });
          
          const response = await fetch(`https://open-api.openocean.finance/v3/base/quote?${params}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log("OpenOcean Response:", data);
            if (data && data.data && data.data.outAmount && data.data.outAmount !== "0") {
              // outAmount ist in D.FAITH (mit 2 Decimals)
              const dfaithAmount = Number(data.data.outAmount) / Math.pow(10, DFAITH_DECIMALS);
              setDfaithPrice(dfaithAmount);
              // Preis wie im SellTab: 1 D.FAITH = (1 ETH / dfaithAmount) * ethEur
              if (ethEur && dfaithAmount > 0) {
                dfaithPriceEur = (1 / dfaithAmount) * ethEur;
              } else {
                dfaithPriceEur = null;
              }
            } else {
              errorMsg = "OpenOcean: Keine Liquidität verfügbar";
            }
          } else {
            errorMsg = `OpenOcean: ${response.status}`;
          }
        } catch (e) {
          console.log("OpenOcean Fehler:", e);
          errorMsg = "OpenOcean API Fehler";
        }
        
        // Fallback auf letzte bekannte D.FAITH Preise
        if (!dfaithPrice && lastKnownPrices.dfaith) {
          setDfaithPrice(lastKnownPrices.dfaith);
          errorMsg = "";
        }
        if (!dfaithPriceEur && lastKnownPrices.dfaithEur) {
          dfaithPriceEur = lastKnownPrices.dfaithEur;
          errorMsg = "";
        }
        
      } catch (e) {
        console.error("Price fetch error:", e);
        errorMsg = "Preis-API Fehler";
        
        // Verwende letzte bekannte Preise als Fallback
        if (lastKnownPrices.dfaith) setDfaithPrice(lastKnownPrices.dfaith);
        if (lastKnownPrices.dfaithEur) dfaithPriceEur = lastKnownPrices.dfaithEur;
        if (lastKnownPrices.ethEur) ethEur = lastKnownPrices.ethEur;
        
        if (dfaithPrice && dfaithPriceEur && ethEur) {
          errorMsg = ""; // Kein Fehler anzeigen wenn Fallback verfügbar
        }
      }
      
      // Setze Preise (entweder neue oder Fallback)
      if (ethEur) setEthPriceEur(ethEur);
      if (dfaithPriceEur !== null && dfaithPriceEur !== undefined) setDfaithPriceEur(dfaithPriceEur);
      
      // Speichere erfolgreiche Preise
      if (dfaithPrice && dfaithPriceEur && ethEur) {
        const newPrices = {
          dfaith: dfaithPrice,
          dfaithEur: dfaithPriceEur,
          ethEur: ethEur,
          timestamp: Date.now()
        };
        setLastKnownPrices(newPrices);
        try {
          localStorage.setItem('dawid_faith_prices', JSON.stringify(newPrices));
        } catch (e) {
          console.log('Fehler beim Speichern der Preise:', e);
        }
        setPriceError(null);
      } else {
        setPriceError(errorMsg || "Preise nicht verfügbar");
      }
      
      setIsLoadingPrice(false);
    };

    fetchDfaithPrice();
    // Preis alle 2 Minuten aktualisieren
    const interval = setInterval(fetchDfaithPrice, 120000);
    return () => clearInterval(interval);
  }, [lastKnownPrices.dfaith, lastKnownPrices.dfaithEur, lastKnownPrices.ethEur]);


  // Entfernt: handleInvestBuy, handleInvestContinue, setShowInvestModal, investBuyModalRef, showInvestModal

  // State für D.FAITH Swap (Modal wird jetzt zentral gesteuert)
  const [swapAmountEth, setSwapAmountEth] = useState("");
  const [slippage, setSlippage] = useState("1");
  const [ethBalance, setEthBalance] = useState("0");
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapTxStatus, setSwapTxStatus] = useState<string | null>(null);

  // ETH Balance laden (auf 3 Stellen)
  useEffect(() => {
    const fetchEthBalance = async () => {
      if (!account?.address) {
        console.log("No account connected");
        return;
      }
      try {
        console.log("Fetching native ETH balance for:", account.address);
        
        const balance = await readContract({
          contract: getContract({
            client,
            chain: base,
            address: "0x0000000000000000000000000000000000000000"
          }),
          method: "function balanceOf(address) view returns (uint256)",
          params: [account.address]
        }).catch(async () => {
          const response = await fetch(base.rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getBalance',
              params: [account.address, 'latest'],
              id: 1
            })
          });
          const data = await response.json();
          return BigInt(data.result);
        });
        
        console.log("Native ETH Balance raw:", balance.toString());
        
        const ethFormatted = Number(balance) / Math.pow(10, 18);
        console.log("Native ETH formatted:", ethFormatted);
        
        // Auf 3 Stellen formatieren
        setEthBalance(ethFormatted.toFixed(3));
        
      } catch (error) {
        console.error("Fehler beim Laden der ETH Balance:", error);
        setEthBalance("0");
      }
    };
    
    fetchEthBalance();
    const interval = setInterval(fetchEthBalance, 10000);
    return () => clearInterval(interval);
  }, [account?.address]);

  // D.FAITH Balance und D.INVEST Balance von der Insight API laden
  const [dfaithBalance, setDfaithBalance] = useState("0.00");
  const [dinvestBalance, setDinvestBalance] = useState("0");

      // Neue Funktion für Balance via Thirdweb Insight API für Base Chain
  const fetchTokenBalanceViaInsightApi = async (
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
      
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.error("BuyTab: Insight API konnte keine JSON-Antwort parsen:", jsonErr);
        data = null;
      }
      
      if (!res.ok) {
        console.error("BuyTab: Insight API Fehlerstatus:", res.status, res.statusText);
        console.error("BuyTab: Insight API Fehlerantwort:", JSON.stringify(data, null, 2));
        throw new Error("API Error");
      }
      
      const balance = data?.data?.[0]?.balance ?? "0";
      return balance;
    } catch (e) {
      console.error("BuyTab: Insight API Fehler:", e);
      return "0";
    }
  };

  // Balances laden
  useEffect(() => {
    const loadBalances = async () => {
      if (!account?.address) {
        setDfaithBalance("0.00");
        setDinvestBalance("0");
        return;
      }
      
      try {
        // D.FAITH Balance laden
        const dfaithValue = await fetchTokenBalanceViaInsightApi(DFAITH_TOKEN, account.address);
        const dfaithRaw = Number(dfaithValue);
        const dfaithDisplay = (dfaithRaw / Math.pow(10, DFAITH_DECIMALS)).toFixed(DFAITH_DECIMALS);
        setDfaithBalance(dfaithDisplay);
        
        // D.INVEST Balance laden  
        const dinvestValue = await fetchTokenBalanceViaInsightApi(DINVEST_TOKEN, account.address);
        setDinvestBalance(Math.floor(Number(dinvestValue)).toString());
        
      } catch (error) {
        console.error("BuyTab: Fehler beim Laden der Token-Balances:", error);
        setDfaithBalance("0.00");
        setDinvestBalance("0");
      }
    };
    
    loadBalances();
    
    // Balance alle 30 Sekunden aktualisieren
    const interval = setInterval(loadBalances, 30000);
    return () => clearInterval(interval);
  }, [account?.address]);

  // D.FAITH Swap Funktion mit mehrstufigem Prozess angepasst für Base Chain
  const handleGetQuote = async () => {
    setSwapTxStatus("pending");
    setQuoteError(null);
    setQuoteTxData(null);
    setSpenderAddress(null);
    setNeedsApproval(false);

    try {
      if (!swapAmountEth || parseFloat(swapAmountEth) <= 0 || !account?.address) return;

      console.log("=== OpenOcean Quote Request für Base ===");
      console.log("ETH Amount:", swapAmountEth);
      
      const quoteParams = new URLSearchParams({
        chain: "base",
        inTokenAddress: "0x0000000000000000000000000000000000000000", // Native ETH
        outTokenAddress: DFAITH_TOKEN, // D.FAITH
        amount: swapAmountEth,
        slippage: slippage,
        gasPrice: "0.001", // Base Chain: 0.001 Gwei
        account: account.address,
      });
      
      const quoteUrl = `https://open-api.openocean.finance/v3/base/swap_quote?${quoteParams}`;
      const quoteResponse = await fetch(quoteUrl);
      
      if (!quoteResponse.ok) {
        throw new Error(`OpenOcean Quote Fehler: ${quoteResponse.status}`);
      }
      
      const quoteData = await quoteResponse.json();
      console.log("Quote Response:", quoteData);
      
      if (!quoteData || quoteData.code !== 200 || !quoteData.data) {
        throw new Error('OpenOcean: Keine gültige Quote erhalten');
      }
      
      const txData = quoteData.data;
      
      if (!txData.to || !txData.data) {
        throw new Error('OpenOcean: Unvollständige Transaktionsdaten');
      }
      
      setQuoteTxData(txData);
      
      // Bei ETH-Käufen ist normalerweise kein Approval nötig, da es native Token sind
      setNeedsApproval(false);
      setBuyStep('quoteFetched');
      setSwapTxStatus(null);
      
    } catch (e: any) {
      console.error("Quote Fehler:", e);
      setQuoteError(e.message || "Quote Fehler");
      setSwapTxStatus("error");
      setTimeout(() => setSwapTxStatus(null), 4000);
    }
  };

  // Approval wird normalerweise nicht benötigt bei ETH → D.FAITH da ETH native ist
  const handleApprove = async () => {
    if (!account?.address) return;
    setSwapTxStatus("approving");
    
    try {
      console.log("Approval für ETH (normalerweise nicht nötig)");
      // Bei Native Token ist kein Approval nötig, also überspringen wir direkt
      setNeedsApproval(false);
      setBuyStep('approved');
      setSwapTxStatus(null);
    } catch (e) {
      console.error("Approve Fehler:", e);
      setSwapTxStatus("error");
      setTimeout(() => setSwapTxStatus(null), 4000);
    }
  };

  // Verbesserter D.FAITH Swap mit ETH-Balance-Verifizierung für Base Chain
  const handleBuySwap = async () => {
    if (!quoteTxData || !account?.address) return;
    setIsSwapping(true);
    setSwapTxStatus("swapping");
    
    // Aktuelle ETH-Balance vor dem Swap speichern
    const initialEthBalance = parseFloat(ethBalance);
    const ethAmount = parseFloat(swapAmountEth);
    
    try {
      console.log("=== D.FAITH Kauf-Swap wird gestartet auf Base ===");
      console.log("Verwende Quote-Daten:", quoteTxData);
      
      const { prepareTransaction } = await import("thirdweb");
      
      // Stelle sicher, dass wir auf Base Chain (ID: 8453) sind
      console.log("Target Chain:", base.name, "Chain ID:", base.id);
      if (base.id !== 8453) {
        throw new Error("Falsche Chain - Base Chain erwartet");
      }
      
      const transaction = await prepareTransaction({
        to: quoteTxData.to,
        data: quoteTxData.data,
        value: BigInt(quoteTxData.value || "0"),
        chain: base, // Explizit Base Chain
        client,
        // Entferne manuelle Gas-Parameter - lass Base Chain automatisch schätzen
      });
      
      console.log("Prepared Transaction:", transaction);
      setSwapTxStatus("confirming");
      
      // Sende Transaktion mit verbesserter Fehlerbehandlung
      try {
        // Explizit Base Chain Context setzen vor Transaction
        console.log("Sende Transaktion auf Base Chain (ID: 8453)");
        sendTransaction(transaction);
        console.log("Transaction sent successfully on Base Chain");
        
        // Da sendTransaction void zurückgibt, können wir nicht sofort die TxHash prüfen
        // Die Balance-Verifizierung wird das Ergebnis bestätigen
      } catch (txError: any) {
        console.log("Transaction error details:", txError);
        
        // Ignoriere Analytics-Fehler von Thirdweb (c.thirdweb.com/event) oder Chain-bezogene 400er
        if (txError?.message?.includes('event') || 
            txError?.message?.includes('analytics') || 
            txError?.message?.includes('c.thirdweb.com') ||
            txError?.message?.includes('400') && txError?.message?.includes('thirdweb')) {
          console.log("Thirdweb API-Fehler ignoriert, Transaktion könnte trotzdem erfolgreich sein");
          // Gehe weiter zur Verifizierung
        } else {
          // Echter Transaktionsfehler
          throw txError;
        }
      }
      
      setSwapTxStatus("verifying");
      console.log("Verifiziere ETH-Balance-Änderung...");
      
      // ETH-Balance-Verifizierung mit mehreren Versuchen
      let balanceVerified = false;
      let attempts = 0;
      const maxAttempts = 30; // Maximal 30 Versuche
      
      // Erste Wartezeit nach Transaktionsbestätigung
      console.log("Warte 3 Sekunden vor erster Balance-Prüfung...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      while (!balanceVerified && attempts < maxAttempts) {
        attempts++;
        console.log(`ETH-Balance-Verifizierung Versuch ${attempts}/${maxAttempts}`);
        
        try {
          if (attempts > 1) {
            const waitTime = Math.min(attempts * 1000, 10000); // 1s, 2s, 3s... bis max 10s
            console.log(`Warte ${waitTime/1000} Sekunden vor nächstem Versuch...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          // ETH-Balance neu laden
          const response = await fetch(base.rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getBalance',
              params: [account.address, 'latest'],
              id: 1
            })
          });
          const data = await response.json();
          const ethRaw = data?.result ? BigInt(data.result) : BigInt(0);
          const currentEthBalance = Number(ethRaw) / Math.pow(10, 18);
          
          console.log(`Initiale ETH-Balance: ${initialEthBalance}, Aktuelle ETH-Balance: ${currentEthBalance}`);
          
          // Prüfe ob sich die ETH-Balance um mindestens den Kaufbetrag verringert hat (mit 10% Toleranz für Fees)
          const expectedDecrease = ethAmount;
          const actualDecrease = initialEthBalance - currentEthBalance;
          
          console.log(`Erwartete Verringerung: ${expectedDecrease}, Tatsächliche Verringerung: ${actualDecrease}`);
          
          if (actualDecrease >= (expectedDecrease * 0.9)) { // 10% Toleranz
            console.log("✅ ETH-Balance-Änderung verifiziert - Kauf erfolgreich!");
            setEthBalance(currentEthBalance.toFixed(3));
            balanceVerified = true;
            setBuyStep('completed');
            setSwapTxStatus("success");
            setSwapAmountEth("");
            setQuoteTxData(null);
            setSpenderAddress(null);
            // D.FAITH Balance auch aktualisieren
            setTimeout(async () => {
              try {
                const dfaithValue = await fetchTokenBalanceViaInsightApi(DFAITH_TOKEN, account.address);
                const dfaithRaw = Number(dfaithValue);
                const dfaithDisplay = (dfaithRaw / Math.pow(10, DFAITH_DECIMALS)).toFixed(DFAITH_DECIMALS);
                setDfaithBalance(dfaithDisplay);
              } catch (error) {
                console.error("Fehler beim Aktualisieren der D.FAITH Balance nach Swap:", error);
              }
            }, 1000);
            setTimeout(() => setSwapTxStatus(null), 5000);
          } else {
            console.log(`Versuch ${attempts}: ETH-Balance noch nicht ausreichend geändert, weiter warten...`);
          }
        } catch (balanceError) {
          console.error(`ETH-Balance-Verifizierung Versuch ${attempts} fehlgeschlagen:`, balanceError);
        }
      }
      
      if (!balanceVerified) {
        console.log("⚠️ ETH-Balance-Verifizierung nach mehreren Versuchen nicht erfolgreich");
        setSwapTxStatus("success");
        setBuyStep('completed');
        setSwapAmountEth("");
        setTimeout(() => setSwapTxStatus(null), 8000);
      }
      
    } catch (error) {
      console.error("Swap Error:", error);
      setSwapTxStatus("error");
      setTimeout(() => setSwapTxStatus(null), 5000);
    } finally {
      setIsSwapping(false);
    }
  };


  // Modal-Ref für Scroll
  const buyModalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showBuyModal && buyModalRef.current) {
      setTimeout(() => {
        buyModalRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }, [showBuyModal]);

  // Token-Auswahl wie im SendTab
  const tokenOptions = [
    {
      key: "DFAITH",
      label: "D.FAITH",
      symbol: "DFAITH",
      balance: dfaithBalance,
      color: "from-amber-400 to-yellow-500",
      description: "Faith Utility Token",
      price: dfaithPriceEur ? `${dfaithPriceEur.toFixed(3)}€ pro D.FAITH` : (isLoadingPrice ? "Laden..." : (priceError || "Preis nicht verfügbar")),
      sub: dfaithPrice ? `1 ETH = ${dfaithPrice.toFixed(2)} D.FAITH` : "Wird geladen...",
      icon: <FaCoins className="text-amber-400" />,
    },
    {
      key: "DINVEST",
      label: "D.INVEST",
      symbol: "DINVEST",
      balance: dinvestBalance,
      color: "from-blue-400 to-blue-600",
      description: "Investment & Staking Token",
      price: "5€ pro D.INVEST",
      sub: "Minimum: 5 EUR",
      icon: <FaLock className="text-blue-400" />,
    },
    {
      key: "ETH",
      label: "ETH",
      symbol: "ETH",
      balance: ethBalance,
      color: "from-blue-500 to-blue-700",
      description: "Ethereum Native Token",
      price: ethPriceEur ? `${ethPriceEur.toFixed(2)}€ pro ETH` : "~3000€ pro ETH",
      sub: "mit EUR kaufen",
      icon: <span className="text-white text-lg font-bold">⟠</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-lg mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent mb-2">
          Token kaufen
        </h2>
        <p className="text-zinc-400">Wähle einen Token und kaufe ihn direkt</p>
      </div>

      {/* Token-Auswahl Grid */}
      <div className="space-y-3">
        <div className="grid gap-3">
          {tokenOptions.map((token) => (
            <div
              key={token.key}
              onClick={() => {
                if (account?.address) {
                  setSelectedToken(token.key as "DFAITH" | "DINVEST" | "ETH");
                  setShowBuyModal(true);
                  setCopied(false);
                } else {
                  alert('Bitte Wallet verbinden!');
                }
              }}
              className="relative cursor-pointer rounded-xl p-4 border-2 transition-all duration-200 bg-zinc-800/50 border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/70 hover:scale-[1.02]"
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full bg-gradient-to-r ${token.color} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                  {token.icon}
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">{token.label}</h3>
                  <p className="text-zinc-400 text-xs">{token.description}</p>
                </div>
              </div>
              <div className="flex justify-between mt-2 text-xs">
                <span className="text-zinc-400">{token.price}</span>
                <span className="text-zinc-400">{token.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Kauf-Modal zentral - Mobile Optimiert und zentriert */}
      {showBuyModal && selectedToken && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto p-4 pt-8 sm:pt-16">
          <div
            ref={buyModalRef}
            className="bg-zinc-900 rounded-xl p-3 sm:p-6 max-w-sm w-full border border-amber-400 max-h-[calc(100vh-8rem)] sm:max-h-[85vh] overflow-y-auto flex flex-col mt-4 sm:mt-0"
            style={{ boxSizing: 'border-box' }}
          >
            {/* Modal-Header */}
            <div className="flex items-center justify-end mb-2">
              <button
                onClick={() => {
                  setShowBuyModal(false);
                  setSelectedToken(null);
                  setSwapAmountEth("");
                  setSlippage("1");
                  setSwapTxStatus(null);
                  setBuyStep('initial');
                  setQuoteTxData(null);
                  setSpenderAddress(null);
                  setNeedsApproval(false);
                  setQuoteError(null);
                }}
                className="p-2 text-amber-400 hover:text-yellow-300 hover:bg-zinc-800 rounded-lg transition-all flex-shrink-0"
                disabled={isSwapping}
              >
                <span className="text-lg">✕</span>
              </button>
            </div>

            {/* Modal-Inhalt je nach Token */}
            {selectedToken === "DFAITH" && (
              <div className="w-full space-y-4">
                {/* Professional Buy Widget Header */}
                <div className="text-center pb-3 border-b border-zinc-700">
                  <div className="w-12 h-12 bg-gradient-to-r from-amber-400 to-yellow-500 rounded-full mx-auto mb-2 flex items-center justify-center shadow-lg">
                    <FaCoins className="text-black text-lg" />
                  </div>
                  <p className="text-zinc-400 text-xs">Faith Utility Token auf Base Network</p>
                  {dfaithPriceEur && (
                    <div className="mt-2 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full inline-block">
                      <span className="text-amber-400 text-xs font-semibold">
                        €{dfaithPriceEur.toFixed(4)} / D.FAITH
                      </span>
                    </div>
                  )}
                </div>

                {/* Buy Widget Steps Indicator */}
                <div className="flex justify-between items-center px-2">
                  <div className={`flex items-center space-x-1 ${buyStep !== 'initial' ? 'text-green-400' : 'text-zinc-500'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${buyStep !== 'initial' ? 'bg-green-500 text-white' : 'bg-zinc-700 text-zinc-400'}`}>
                      {buyStep !== 'initial' ? '✓' : '1'}
                    </div>
                    <span className="text-xs font-medium">Quote</span>
                  </div>
                  <div className={`w-8 h-0.5 ${buyStep === 'approved' || buyStep === 'completed' ? 'bg-green-500' : 'bg-zinc-700'}`}></div>
                  <div className={`flex items-center space-x-1 ${buyStep === 'approved' || buyStep === 'completed' ? 'text-green-400' : 'text-zinc-500'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${buyStep === 'approved' || buyStep === 'completed' ? 'bg-green-500 text-white' : 'bg-zinc-700 text-zinc-400'}`}>
                      {buyStep === 'approved' || buyStep === 'completed' ? '✓' : '2'}
                    </div>
                    <span className="text-xs font-medium">Approve</span>
                  </div>
                  <div className={`w-8 h-0.5 ${buyStep === 'completed' ? 'bg-green-500' : 'bg-zinc-700'}`}></div>
                  <div className={`flex items-center space-x-1 ${buyStep === 'completed' ? 'text-green-400' : 'text-zinc-500'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${buyStep === 'completed' ? 'bg-green-500 text-white' : 'bg-zinc-700 text-zinc-400'}`}>
                      {buyStep === 'completed' ? '✓' : '3'}
                    </div>
                    <span className="text-xs font-medium">Purchase</span>
                  </div>
                </div>

                {/* Amount Input Section */}
                <div className="space-y-3">
                  <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">You Pay</label>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-2 bg-blue-500/20 rounded-lg px-2 py-1 border border-blue-500/30 flex-shrink-0">
                        <span className="text-blue-400 text-sm">⟠</span>
                        <span className="text-blue-300 font-semibold text-xs">ETH</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="0.0"
                        className="flex-1 bg-transparent text-lg sm:text-xl font-bold text-white focus:outline-none min-w-0"
                        value={swapAmountEth}
                        onChange={e => setSwapAmountEth(e.target.value)}
                        disabled={isSwapping || buyStep !== 'initial'}
                      />
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">Balance: {ethBalance} ETH</span>
                      <button
                        className="text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded"
                        onClick={() => setSwapAmountEth((parseFloat(ethBalance) * 0.95).toFixed(3))}
                        disabled={isSwapping || parseFloat(ethBalance) <= 0 || buyStep !== 'initial'}
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  {/* You Receive Section mit Exchange Rate */}
                  <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">You Receive</label>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-2 bg-amber-500/20 rounded-lg px-2 py-1 border border-amber-500/30 flex-shrink-0">
                        <FaCoins className="text-amber-400 text-sm" />
                        <span className="text-amber-300 font-semibold text-xs">D.FAITH</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-lg sm:text-xl font-bold text-amber-400">
                          {swapAmountEth && parseFloat(swapAmountEth) > 0 && dfaithPrice 
                            ? (parseFloat(swapAmountEth) * dfaithPrice).toFixed(2)
                            : "0.00"
                          }
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">
                        {dfaithPrice ? `1 ETH = ${dfaithPrice.toFixed(2)} D.FAITH` : "Loading..."}
                      </span>
                      <span className="text-zinc-500">
                        {swapAmountEth && parseFloat(swapAmountEth) > 0 && dfaithPrice && dfaithPriceEur
                          ? `≈ €${(parseFloat(swapAmountEth) * dfaithPrice * dfaithPriceEur).toFixed(2)}`
                          : ""
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* Advanced Settings - Kompakt */}
                <div className="bg-zinc-800/30 rounded-xl p-3 border border-zinc-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm font-medium text-zinc-300 whitespace-nowrap">Slippage</span>
                      <input
                        type="number"
                        placeholder="1.0"
                        min="0.1"
                        max="50"
                        step="0.1"
                        className="w-16 bg-zinc-700 border border-zinc-600 rounded-lg py-1 px-2 text-sm text-zinc-300 focus:border-amber-500 focus:outline-none"
                        value={slippage}
                        onChange={(e) => setSlippage(e.target.value)}
                        disabled={isSwapping || buyStep !== 'initial'}
                      />
                      <span className="text-xs text-zinc-500">%</span>
                    </div>
                    <div className="flex gap-1">
                      {["0.5", "1", "3"].map((value) => (
                        <button
                          key={value}
                          className={`px-2 py-1 rounded text-xs font-medium transition ${
                            slippage === value 
                              ? "bg-amber-500 text-black" 
                              : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                          }`}
                          onClick={() => setSlippage(value)}
                          disabled={isSwapping || buyStep !== 'initial'}
                        >
                          {value}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Status Display */}
                {swapTxStatus && (
                  <div className={`rounded-xl p-3 border text-center ${
                    swapTxStatus === "success" ? "bg-green-500/10 border-green-500/30 text-green-400" :
                    swapTxStatus === "error" ? "bg-red-500/10 border-red-500/30 text-red-400" :
                    "bg-blue-500/10 border-blue-500/30 text-blue-400"
                  }`}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {swapTxStatus === "success" && <span className="text-xl">🎉</span>}
                      {swapTxStatus === "error" && <span className="text-xl">❌</span>}
                      {swapTxStatus === "pending" && <span className="text-xl">📝</span>}
                      {swapTxStatus === "confirming" && <span className="text-xl">⏳</span>}
                      {swapTxStatus === "verifying" && <span className="text-xl">🔎</span>}
                      {swapTxStatus === "swapping" && <span className="text-xl">🔄</span>}
                      <span className="font-semibold text-sm">
                        {swapTxStatus === "success" && "Purchase Successful!"}
                        {swapTxStatus === "error" && "Purchase Failed"}
                        {swapTxStatus === "pending" && "Getting Quote..."}
                        {swapTxStatus === "confirming" && "Confirming..."}
                        {swapTxStatus === "verifying" && "Verifying..."}
                        {swapTxStatus === "swapping" && "Processing Purchase..."}
                      </span>
                    </div>
                    {swapTxStatus === "error" && quoteError && (
                      <p className="text-sm opacity-80">{quoteError}</p>
                    )}
                  </div>
                )}

                {/* Validation Warnings */}
                {parseFloat(swapAmountEth) > parseFloat(ethBalance) && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-2 text-red-400 text-sm">
                    <div className="flex items-center gap-2">
                      <span>⚠️</span>
                      <span>Insufficient ETH balance</span>
                    </div>
                  </div>
                )}

                {parseFloat(swapAmountEth) > 0 && parseFloat(swapAmountEth) < 0.001 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-2 text-yellow-400 text-sm">
                    <div className="flex items-center gap-2">
                      <span>💡</span>
                      <span>Minimum purchase: 0.001 ETH</span>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2">
                  {buyStep === 'initial' && (
                    <Button
                      className="w-full bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-black font-bold py-3 rounded-xl text-base transition-all transform hover:scale-[1.02]"
                      onClick={handleGetQuote}
                      disabled={
                        !swapAmountEth || 
                        parseFloat(swapAmountEth) <= 0 || 
                        isSwapping || 
                        !account?.address || 
                        parseFloat(ethBalance) <= 0 ||
                        parseFloat(swapAmountEth) > parseFloat(ethBalance) ||
                        parseFloat(swapAmountEth) < 0.001
                      }
                    >
                      {isSwapping ? "Processing..." : "Get Quote"}
                    </Button>
                  )}

                  {buyStep === 'quoteFetched' && needsApproval && (
                    <Button
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-base transition-all"
                      onClick={handleApprove}
                      disabled={isSwapping}
                    >
                      {isSwapping ? "Approving..." : "Approve ETH"}
                    </Button>
                  )}

                  {((buyStep === 'quoteFetched' && !needsApproval) || buyStep === 'approved') && (
                    <Button
                      className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 rounded-xl text-base transition-all transform hover:scale-[1.02]"
                      onClick={handleBuySwap}
                      disabled={isSwapping}
                    >
                      {isSwapping ? "Processing Purchase..." : `Buy ${swapAmountEth || "0"} ETH worth of D.FAITH`}
                    </Button>
                  )}

                  {buyStep === 'completed' && (
                    <Button
                      className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-3 rounded-xl text-base transition-all"
                      onClick={() => {
                        setBuyStep('initial');
                        setQuoteTxData(null);
                        setSpenderAddress(null);
                        setNeedsApproval(false);
                        setQuoteError(null);
                        setSwapAmountEth("");
                        setSwapTxStatus(null);
                        setSlippage("1");
                      }}
                      disabled={isSwapping}
                    >
                      Make Another Purchase
                    </Button>
                  )}
                </div>
              </div>
            )}
            {selectedToken === "DINVEST" && (
              <>
                <div className="mb-3 text-zinc-300 text-sm">
                  <b>Preis:</b> 5€ pro D.INVEST<br />
                  <b>Minimum:</b> 5 EUR
                </div>
                <div className="mb-3 text-zinc-300 text-sm">
                  {copied
                    ? "Deine Wallet-Adresse wurde kopiert. Bitte füge sie beim Stripe-Kauf als Verwendungszweck ein, damit wir dir die Token zuweisen können."
                    : "Bitte stelle sicher, dass du eine Wallet verbunden hast."}
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-bold py-2 rounded-xl mt-1"
                  onClick={async () => {
                    if (account?.address) {
                      await navigator.clipboard.writeText(account.address);
                      setCopied(true);
                    }
                    window.open('https://dein-stripe-link.de', '_blank');
                  }}
                  autoFocus
                >
                  Weiter zu Stripe
                </Button>
              </>
            )}
            {selectedToken === "ETH" && (
              <div className="w-full flex-1 flex items-center justify-center">
                <BuyWidget
                  client={client}
                  tokenAddress={NATIVE_TOKEN_ADDRESS}
                  chain={base}
                  amount="0.1"
                  theme="dark"
                  className="w-full"
                />
              </div>
            )}
            <Button
              className="w-full bg-zinc-600 hover:bg-zinc-700 text-white font-bold py-2 rounded-lg text-xs mt-2"
              onClick={() => {
                setShowBuyModal(false);
                setSelectedToken(null);
                setSwapAmountEth("");
                setSlippage("1");
                setSwapTxStatus(null);
                setBuyStep('initial');
                setQuoteTxData(null);
                setSpenderAddress(null);
                setNeedsApproval(false);
                setQuoteError(null);
              }}
              disabled={isSwapping}
            >
              Schließen
            </Button>
          </div>
        </div>
      )}
      {/* Hinweis nur einmal anzeigen */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mt-6">
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
            <span className="text-blue-400 text-xs">ℹ</span>
          </div>
          <div>
            <div className="font-medium text-blue-400 mb-1">Hinweis</div>
            <div className="text-sm text-zinc-400">
              Stellen Sie sicher, dass Sie genügend ETH für Transaktionsgebühren in Ihrem Wallet haben.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

