import { useState, useEffect } from "react";
import { Button } from "../../../../components/ui/button";
import { FaPaperPlane, FaArrowDown, FaExchangeAlt, FaCoins, FaLock } from "react-icons/fa";
import { useActiveAccount } from "thirdweb/react";

type Transaction = {
  id: string;
  type: "send" | "receive";
  token: string;
  amount: string;
  address: string;
  hash: string;
  time: string;
  status: "success" | "pending" | "failed";
};

export default function HistoryTab() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [stats, setStats] = useState<{
    transactionCount: number;
    totalValue: number;
    avgGas: number;
  } | null>(null);
  const account = useActiveAccount();

  // Demo-Daten für den Fall, dass kein API-Key verfügbar ist
  const demoTransactions: Transaction[] = [
    {
      id: "demo1",
      type: "receive",
      token: "ETH", 
      amount: "+0.5",
      address: "0x1234...5678",
      hash: "0xdemo1234567890abcdef",
      time: "15.01.2024, 14:30",
      status: "success"
    },
    {
      id: "demo2", 
      type: "send",
      token: "USDC",
      amount: "-100.0",
      address: "0xabcd...efgh",
      hash: "0xdemo2345678901bcdef0",
      time: "14.01.2024, 09:15",
      status: "success"
    }
  ];

  // Feste Wallet-Adresse für das Modal
  const targetAddress = "0x651BACc1A1579f2FaaeDA2450CE59bB5E7D26e7d";
  
  // Verwende entweder die verbundene Wallet oder die feste Adresse
  const userAddress = account?.address || targetAddress;

  // Thirdweb Insight API Statistiken abrufen
  const getTransactionStats = async () => {
    try {
      const clientId = process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID;
      if (!clientId) return null;

      const response = await fetch(
        "https://insight.thirdweb.com/v1/transactions?aggregate=count() AS transaction_count&aggregate=sum(value) AS total_value&aggregate=avg(gas_used) AS avg_gas",
        {
          headers: {
            "x-client-id": clientId,
          },
        },
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log("Transaction Stats:", data);
        return data;
      }
    } catch (error) {
      console.error("Stats Error:", error);
    }
    return null;
  };

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!userAddress) {
        setTransactions([]);
        return;
      }

      setIsLoading(true);
      setError("");
      
      try {
        // ✅ THIRDWEB INSIGHT API - Zuverlässiger als Etherscan für Base Chain
        console.log("🚀 Verwende Thirdweb Insight API für Base Chain Transaktionen");
        
        const clientId = process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID;
        if (!clientId) {
          console.warn("⚠️ Kein Thirdweb Client ID verfügbar - verwende Demo-Daten");
          setError(`
            🔑 Thirdweb Client ID Setup erforderlich:
            
            1. Öffnen Sie die .env.local Datei im Projekt-Root
            2. Stellen Sie sicher, dass NEXT_PUBLIC_TEMPLATE_CLIENT_ID gesetzt ist
            3. Starten Sie die App neu
            
            Thirdweb Insight API bietet zuverlässige Transaktionsdaten für Base Chain!
          `);
          setTransactions(demoTransactions);
          setIsLoading(false);
          return;
        }
        
        console.log("✅ Thirdweb Client ID gefunden:", clientId.substring(0, 10) + "...");
        
        // API-Parameter für Base Chain (Chain ID: 8453)
        const params = new URLSearchParams({
          chain_id: "8453", // Base Chain
          to_address: userAddress,
          from_address: userAddress,
          limit: "50",
          order: "desc",
          sort_by: "block_timestamp",
        });
        
        // Thirdweb Insight API für Transaktionen
        const apiUrl = `https://insight.thirdweb.com/v1/transactions?${params.toString()}`;
        console.log("API Call:", apiUrl);
        
        const response = await fetch(apiUrl, {
          method: "GET",
          headers: {
            "x-client-id": clientId,
            "Content-Type": "application/json",
          },
        });
        
        if (!response.ok) {
          throw new Error(`Thirdweb Insight API Fehler: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("Thirdweb Insight API Response:", data);
        
        let allTransactions: any[] = [];
        
        if (data?.data && Array.isArray(data.data)) {
          allTransactions = data.data;
          console.log(`✅ ${allTransactions.length} Transaktionen von Thirdweb Insight API erhalten`);
        } else {
          console.log("ℹ️ Keine Transaktionen in der Antwort gefunden");
        }

        console.log(`Total transactions found: ${allTransactions.length}`);

        // Wenn keine Transaktionen gefunden wurden
        if (allTransactions.length === 0) {
          console.log("No transactions found for address:", userAddress);
          setTransactions([]);
          setIsLoading(false);
          return;
        }

        // Nach Zeitstempel sortieren (neueste zuerst) - Thirdweb Insight Format
        allTransactions.sort((a, b) => {
          const timestampA = new Date(a.block_timestamp || a.timestamp || 0).getTime();
          const timestampB = new Date(b.block_timestamp || b.timestamp || 0).getTime();
          return timestampB - timestampA;
        });

        // Auf unser Transaction-Format mappen - Thirdweb Insight API Format
        const mappedTransactions: Transaction[] = allTransactions.slice(0, 50).map((tx: any) => {
          // Thirdweb Insight API verwendet block_timestamp im ISO-Format
          const timestamp = new Date(tx.block_timestamp || tx.timestamp || Date.now()).getTime();
          const date = new Date(timestamp);
          const time = date.toLocaleString("de-DE", {
            day: "2-digit",
            month: "2-digit", 
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });

          let type: "send" | "receive" = "send";
          let token = "ETH";
          let amount = "0";
          let address = "";

          // Bestimme Transaktionsrichtung basierend auf from/to
          const isReceived = tx.to_address?.toLowerCase() === userAddress.toLowerCase();
          const isFromUser = tx.from_address?.toLowerCase() === userAddress.toLowerCase();
          
          if (isReceived && !isFromUser) {
            type = "receive";
            address = tx.from_address || "";
          } else {
            type = "send";
            address = tx.to_address || "";
          }

          // Wert formatieren - Thirdweb gibt Werte meist in Wei zurück
          let value = 0;
          if (tx.value) {
            if (typeof tx.value === 'string' && tx.value.includes('e')) {
              // Wissenschaftliche Notation
              value = parseFloat(tx.value);
            } else {
              // Wei zu ETH konvertieren
              value = Number(tx.value) / Math.pow(10, 18);
            }
          }
          
          amount = (type === "receive" ? "+" : "-") + value.toFixed(6);

          // Token-Symbol bestimmen
          if (tx.token_symbol) {
            token = tx.token_symbol;
          } else if (tx.token_address && tx.token_address !== "0x0000000000000000000000000000000000000000") {
            token = "TOKEN"; // Unbekannter Token
          } else {
            token = "ETH"; // Native ETH
          }

          // Status bestimmen
          let status: "success" | "pending" | "failed" = "success";
          if (tx.status === "failed" || tx.status === 0 || tx.status === "0") {
            status = "failed";
          } else if (tx.status === "pending" || !tx.block_number) {
            status = "pending";
          }

          return {
            id: tx.transaction_hash || tx.hash || Math.random().toString(),
            type,
            token,
            amount,
            address,
            hash: tx.transaction_hash || tx.hash || "",
            time,
            status,
          };
        });

        setTransactions(mappedTransactions);
        
        // Statistiken abrufen (optional)
        try {
          const statsData = await getTransactionStats();
          if (statsData?.data?.[0]) {
            setStats({
              transactionCount: statsData.data[0].transaction_count || 0,
              totalValue: statsData.data[0].total_value || 0,
              avgGas: statsData.data[0].avg_gas || 0,
            });
          }
        } catch (statsError) {
          console.log("Statistiken konnten nicht geladen werden:", statsError);
        }
        
      } catch (err) {
        console.error("Fehler beim Laden der Transaktionen:", err);
        setError("Fehler beim Laden der Transaktionsdaten");
        setTransactions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, [userAddress]);

  // Hilfsfunktionen für Anzeige
  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "send":
        return <FaPaperPlane className="text-white text-xs" />;
      case "receive":
        return <FaArrowDown className="text-white text-xs" />;
      default:
        return <FaCoins className="text-white text-xs" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case "send":
        return "from-red-400 to-red-600";
      case "receive":
        return "from-green-400 to-green-600";
      default:
        return "from-zinc-400 to-zinc-600";
    }
  };

  const getAmountColor = (amount: string) => {
    if (amount.startsWith("+")) return "text-green-400";
    if (amount.startsWith("-")) return "text-red-400";
    return "text-amber-400";
  };

  const formatAddress = (addr: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent mb-2">
          Transaktionshistorie
        </h2>
        <p className="text-zinc-400">Live Transaktionsdaten vom Base Network via Thirdweb Insight API</p>
        {userAddress && (
          <p className="text-xs text-zinc-500 mt-1">
            Wallet: {formatAddress(userAddress)}
          </p>
        )}
      </div>

      {/* Debug Info - nur in Development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700 mb-4">
          <h3 className="text-sm font-semibold text-amber-400 mb-2">Debug Info</h3>
          <div className="text-xs text-zinc-400 space-y-1">
            <div>Thirdweb Client ID: {process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID ? '✓ Konfiguriert' : '✗ Fehlt'}</div>
            <div>API: Thirdweb Insight API (Base Chain)</div>
            <div>Chain ID: 8453 (Base)</div>
            <div>Wallet: {userAddress || 'Nicht verbunden'}</div>
            <div>Loading: {isLoading ? 'Ja' : 'Nein'}</div>
            <div>Error: {error || 'Keine'}</div>
            <div>Transactions: {transactions.length}</div>
            {stats && <div>API Stats: {stats.transactionCount} total, Ø {stats.avgGas.toFixed(0)} gas</div>}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
          <span className="ml-3 text-zinc-400">Lade Transaktionen...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && !userAddress && (
        <div className="text-center py-8">
          <p className="text-zinc-400">Keine Wallet-Adresse verfügbar.</p>
        </div>
      )}

      {/* No Transactions */}
      {!isLoading && !error && userAddress && transactions.length === 0 && (
        <div className="text-center py-8">
          <div className="bg-zinc-800/50 rounded-lg p-6 border border-zinc-700">
            <FaCoins className="text-4xl text-zinc-500 mx-auto mb-4" />
            <p className="text-zinc-400 text-lg mb-2">Keine Transaktionen gefunden</p>
            <p className="text-zinc-500 text-sm">
              Diese Wallet-Adresse hat noch keine aufgezeichneten Transaktionen auf Base Network.
            </p>
          </div>
        </div>
      )}

      {/* Transaktionsliste */}
      {!isLoading && !error && transactions.length > 0 && (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {transactions.map((tx) => (
            <div key={tx.id} className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-4 border border-zinc-700 hover:border-zinc-600 transition-all hover:shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-r ${getTransactionColor(tx.type)} flex items-center justify-center shadow-lg`}>
                    {getTransactionIcon(tx.type)}
                  </div>
                  <div>
                    <div className="font-medium text-amber-400 capitalize text-lg">
                      {tx.type === "send" && "Gesendet"}
                      {tx.type === "receive" && "Empfangen"}
                    </div>
                    <div className="text-xs text-zinc-500">{tx.time}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold text-lg ${getAmountColor(tx.amount)}`}>
                    {tx.amount}
                  </div>
                  <div className="text-sm font-semibold text-zinc-400">{tx.token}</div>
                </div>
              </div>
              
              <div className="text-sm text-zinc-400 space-y-2 bg-zinc-900/50 rounded-lg p-3">
                <div className="flex justify-between">
                  <span className="text-zinc-500">
                    {tx.type === "send" ? "An:" : "Von:"}
                  </span>
                  <span className="font-mono text-amber-400">
                    {formatAddress(tx.address)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tx Hash:</span>
                  <span className="font-mono text-blue-400">
                    {formatAddress(tx.hash)}
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex justify-between items-center mt-4">
                <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                  tx.status === "success" 
                    ? "bg-green-500/20 text-green-400 border border-green-500/30" 
                    : tx.status === "pending"
                    ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                }`}>
                  {tx.status === "success" && "✓ Erfolgreich"}
                  {tx.status === "pending" && "⏳ Ausstehend"}
                  {tx.status === "failed" && "✗ Fehlgeschlagen"}
                </span>
                <a
                  href={`https://basescan.org/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-amber-400 hover:text-amber-300 transition underline font-medium bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20 hover:border-amber-500/40"
                >
                  Basescan ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="text-center py-6">
          <div className="bg-red-500/20 text-red-400 rounded-lg p-4 border border-red-500/30">
            <p className="font-semibold mb-1">Fehler beim Laden</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Enhanced Summary Stats mit Thirdweb Insight Daten */}
      {!isLoading && !error && transactions.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-4 border border-zinc-700 text-center">
            <div className="text-2xl font-bold text-amber-400 mb-1">
              {transactions.length}
            </div>
            <div className="text-xs text-zinc-500">Gezeigt</div>
          </div>
          <div className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-4 border border-zinc-700 text-center">
            <div className="text-2xl font-bold text-green-400 mb-1">
              {transactions.filter(tx => tx.status === "success").length}
            </div>
            <div className="text-xs text-zinc-500">Erfolgreich</div>
          </div>
          <div className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-4 border border-zinc-700 text-center">
            <div className="text-2xl font-bold text-red-400 mb-1">
              {transactions.filter(tx => tx.status === "failed").length}
            </div>
            <div className="text-xs text-zinc-500">Fehlgeschlagen</div>
          </div>
          {stats && (
            <div className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-4 border border-zinc-700 text-center">
              <div className="text-2xl font-bold text-blue-400 mb-1">
                {stats.transactionCount}
              </div>
              <div className="text-xs text-zinc-500">Total (API)</div>
            </div>
          )}
        </div>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center mt-6">
        <Button
          onClick={() => window.location.reload()}
          className="bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black font-semibold px-6 py-2 rounded-lg transition-all"
          disabled={isLoading}
        >
          {isLoading ? "Lädt..." : "Aktualisieren"}
        </Button>
      </div>
    </div>
  );
}
