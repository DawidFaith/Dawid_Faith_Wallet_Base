import { useState, useEffect } from "react";
import { Button } from "../../../../components/ui/button";
import { FaPaperPlane, FaLock, FaCoins, FaEthereum, FaExchangeAlt, FaWallet, FaTimes } from "react-icons/fa";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { base } from "thirdweb/chains";
import { getContract, prepareContractCall } from "thirdweb";
import { client } from "../../client";
import { fetchAllBalances, TOKEN_ADDRESSES, TOKEN_DECIMALS } from "../../utils/balanceUtils";

// Modal Komponente für Token Transfer (mit echter Transaktion und Bestätigung)
function TokenTransferModal({ 
  open, 
  onClose, 
  token, 
  onSend, 
  showSuccess, 
  onSuccessClose 
}: { 
  open: boolean, 
  onClose: () => void, 
  token: any | null,
  onSend: (amount: string, address: string) => Promise<boolean>,
  showSuccess: boolean,
  onSuccessClose: () => void
}) {
  const [sendAmount, setSendAmount] = useState("");
  const [sendToAddress, setSendToAddress] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSendAmount("");
      setSendToAddress("");
      setTxError(null);
    }
  }, [open]);

  if (!open || !token) return null;

  const handleSend = async () => {
    if (!sendAmount || !sendToAddress) return;
    setIsSending(true);
    setTxError(null);
    try {
      const ok = await onSend(sendAmount, sendToAddress);
      if (!ok) {
        setTxError("Transaktion fehlgeschlagen");
        setIsSending(false);
        return;
      }
      setSendAmount("");
      setSendToAddress("");
    } catch (error: any) {
      setTxError(error?.message || "Fehler beim Senden");
    } finally {
      setIsSending(false);
    }
  };

  const handleMax = () => {
    setSendAmount(token.balance.replace(",", "."));
  };

  const isAmountValid = sendAmount && 
    parseFloat(sendAmount) > 0 && 
    parseFloat(sendAmount) <= parseFloat(token.balance.replace(",", "."));

  // Success Modal
  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-zinc-900 rounded-xl w-full max-w-sm mx-4 p-8 flex flex-col items-center border border-green-500">
          <div className="text-5xl mb-4">✅</div>
          <div className="text-green-400 text-xl font-bold mb-2">Token gesendet!</div>
          <div className="text-zinc-300 text-center mb-4">Deine Transaktion wurde erfolgreich abgeschickt.</div>
          <Button className="w-full bg-gradient-to-r from-green-400 to-green-600 text-black font-bold py-3 rounded-xl mt-2" onClick={onSuccessClose}>
            Schließen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-zinc-900 rounded-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${token.color} flex items-center justify-center`}>
              {token.icon}
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">{token.label} senden</h3>
              <p className="text-zinc-400 text-sm">Verfügbar: {token.balance}</p>
            </div>
          </div>
          <button 
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
            onClick={onClose}
          >
            <FaTimes size={16} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Betrag Eingabe */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <FaExchangeAlt className="text-amber-400" />
              Betrag eingeben:
            </label>
            
            <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1">
                  <input
                    type="number"
                    placeholder="0.00"
                    min="0"
                    step={token.key === "DINVEST" ? "1" : "0.000001"}
                    className={`w-full bg-transparent text-2xl font-bold placeholder-zinc-500 focus:outline-none ${
                      sendAmount && parseFloat(sendAmount) > parseFloat(token.balance.replace(",", ".")) 
                        ? 'text-red-400' 
                        : 'text-white'
                    }`}
                    value={sendAmount}
                    onChange={e => {
                      let val = e.target.value.replace(",", ".");
                      if (token.key === "DINVEST") val = val.replace(/\..*$/, "");
                      setSendAmount(val);
                    }}
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-zinc-400 text-sm">
                      Verfügbar: {token.balance} {token.symbol}
                    </span>
                    <button
                      className="bg-gradient-to-r from-amber-500 to-yellow-600 text-black px-4 py-1 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                      type="button"
                      onClick={handleMax}
                    >
                      MAX
                    </button>
                  </div>
                </div>
              </div>
              {/* Balance-Validierung */}
              {sendAmount && parseFloat(sendAmount) > parseFloat(token.balance.replace(",", ".")) && (
                <div className="mt-2 text-sm text-red-400 bg-red-500/20 border border-red-500/30 rounded-lg p-2 flex items-center gap-2">
                  <span>❌</span>
                  <span>Nicht genügend {token.symbol} verfügbar</span>
                </div>
              )}
              {txError && (
                <div className="mt-2 text-sm text-red-400 bg-red-500/20 border border-red-500/30 rounded-lg p-2 flex items-center gap-2">
                  <span>❌</span>
                  <span>{txError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Empfänger Eingabe */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <FaWallet className="text-amber-400" />
              Empfänger Adresse:
            </label>
            <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 p-4">
              <input
                type="text"
                placeholder="0x... oder ENS Name"
                className="w-full bg-transparent text-white placeholder-zinc-500 focus:outline-none font-mono"
                value={sendToAddress}
                onChange={e => setSendToAddress(e.target.value)}
                autoComplete="off"
                inputMode="text"
              />
              <div className="text-xs text-zinc-500 mt-2">
                Base Network Adresse eingeben
              </div>
            </div>
          </div>

          {/* Transaktionsübersicht */}
          {sendAmount && sendToAddress && isAmountValid && (
            <div className="bg-gradient-to-r from-zinc-800/60 to-zinc-900/60 rounded-xl p-4 border border-zinc-600/50">
              <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                <FaPaperPlane className="text-amber-400" />
                Transaktionsübersicht
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Du sendest:</span>
                  <span className="text-white font-semibold">{sendAmount} {token.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">An:</span>
                  <span className="text-amber-400 font-mono text-xs">
                    {sendToAddress.slice(0, 8)}...{sendToAddress.slice(-6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Netzwerkgebühr:</span>
                  <span className="text-zinc-300">~0.001 ETH</span>
                </div>
                <div className="border-t border-zinc-600 pt-2 flex justify-between">
                  <span className="text-zinc-300 font-semibold">Geschätzte Zeit:</span>
                  <span className="text-green-400 font-semibold">~30 Sekunden</span>
                </div>
              </div>
            </div>
          )}

          {/* Senden Button */}
          <Button
            className={`w-full py-4 font-bold rounded-xl text-lg shadow-lg transition-all ${
              isAmountValid && sendToAddress && !isSending
                ? `bg-gradient-to-r ${token.color} text-black hover:opacity-90 transform hover:scale-[1.02]`
                : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
            }`}
            onClick={handleSend}
            disabled={!isAmountValid || !sendToAddress || isSending}
          >
            {isSending ? (
              <div className="flex items-center justify-center gap-2">
                <span className="animate-spin">↻</span>
                <span>Wird gesendet...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <FaPaperPlane />
                <span>
                  {sendAmount || "0"} {token.symbol} senden
                </span>
              </div>
            )}
          </Button>

          {/* Sicherheitshinweis */}
          <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-xl p-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-yellow-400 text-lg">⚠️</span>
              <div>
                <p className="text-yellow-200 font-semibold mb-1">Wichtiger Sicherheitshinweis</p>
                <p className="text-yellow-100 text-xs leading-relaxed">
                  Überprüfe die Empfängeradresse sorgfältig. Blockchain-Transaktionen sind irreversibel und können nicht rückgängig gemacht werden.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const getTokenIcon = (tokenKey: string) => {
    switch (tokenKey) {
      case "DFAITH":
        return <FaCoins className="text-amber-400" />;
      case "DINVEST":
        return <FaWallet className="text-blue-400" />;
      case "ETH":
        return <FaEthereum className="text-purple-400" />;
      default:
        return <FaCoins className="text-gray-400" />;
    }
  };

export default function SendTab() {
  const [selectedToken, setSelectedToken] = useState<any | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const account = useActiveAccount();
  const { mutateAsync: sendTransaction } = useSendTransaction();

  // Token-Konstanten mit neuen Adressen auf Base
  // Neue Token-Adressen (Stand: Juli 2025)
  const DFAITH_TOKEN = "0xeB6f60E08AaAd7951896BdefC65cB789633BbeAd";
  const DFAITH_DECIMALS = TOKEN_DECIMALS.DFAITH;
  const DINVEST_TOKEN = "0x9D7a06c24F114f987d8C08f0fc8Aa422910F3902";
  const DINVEST_DECIMALS = TOKEN_DECIMALS.DINVEST;
  const ETH_TOKEN = TOKEN_ADDRESSES.NATIVE_ETH;
  const ETH_DECIMALS = TOKEN_DECIMALS.ETH;

  // Balances
  const [dfaithBalance, setDfaithBalance] = useState("0.00");
  const [dinvestBalance, setDinvestBalance] = useState("0");
  const [ethBalance, setEthBalance] = useState("0.0000");
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  useEffect(() => {
    if (!account?.address) {
      setDfaithBalance("0.00");
      setDinvestBalance("0");
      setEthBalance("0.0000");
      return;
    }

    const loadBalances = async () => {
      setIsLoadingBalances(true);
      try {
        const balances = await fetchAllBalances(account.address);
        if (balances.dfaith !== undefined) setDfaithBalance(balances.dfaith);
        if (balances.dinvest !== undefined) setDinvestBalance(balances.dinvest);
        if (balances.eth !== undefined) setEthBalance(balances.eth);
      } catch (error) {
        console.error("Fehler beim Laden der Balances:", error);
      } finally {
        setIsLoadingBalances(false);
      }
    };

    loadBalances();
    const interval = setInterval(loadBalances, 10000);
    return () => clearInterval(interval);
  }, [account?.address]);

  // Hilfsfunktion zum Warten auf Balance-Änderung
  const waitForBalanceChange = async (tokenKey: string, oldBalance: string, address: string, maxTries = 15) => {
    type Balances = { dfaith: string; dinvest: string; eth: string };
    const keyMap: Record<string, keyof Balances> = {
      DFAITH: "dfaith",
      DINVEST: "dinvest",
      ETH: "eth",
    };
    for (let i = 0; i < maxTries; i++) {
      await new Promise(res => setTimeout(res, 2000));
      const balances: Balances = await fetchAllBalances(address);
      const mappedKey = keyMap[tokenKey] || (tokenKey.toLowerCase() as keyof Balances);
      let newBalance = balances[mappedKey];
      if (newBalance !== undefined && newBalance !== oldBalance) {
        return true;
      }
    }
    return false;
  };

  // Echte Token-Transaktion
  const handleSend = async (amount: string, toAddress: string): Promise<boolean> => {
    if (!amount || !toAddress || !selectedToken || !account?.address) return false;
    try {
      let tx;
      // Vorherige Balance merken
      const oldBalance = selectedToken.balance;
      if (selectedToken.key === "ETH") {
        tx = {
          to: toAddress,
          value: BigInt(Math.floor(parseFloat(amount) * Math.pow(10, ETH_DECIMALS))),
          chain: base,
          client,
        };
        await sendTransaction(tx);
      } else {
        const tokenAddress = selectedToken.key === "DFAITH" ? DFAITH_TOKEN : DINVEST_TOKEN;
        const decimals = selectedToken.key === "DFAITH" ? DFAITH_DECIMALS : DINVEST_DECIMALS;
        const contract = getContract({ client, chain: base, address: tokenAddress });
        const txCall = prepareContractCall({
          contract,
          method: "function transfer(address,uint256) returns (bool)",
          params: [toAddress, BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)))]
        });
        await sendTransaction(txCall);
      }
      // Warte auf Balance-Änderung
      const changed = await waitForBalanceChange(selectedToken.key, oldBalance, account.address);
      if (changed) {
        setShowSuccessModal(true);
      }
      return true;
    } catch (error) {
      console.error("Fehler beim Senden:", error);
      return false;
    }
  };

  const handleTokenSelect = (token: any) => {
    setSelectedToken(token);
    setShowTransferModal(true);
    setShowSuccessModal(false);
  };

  const tokenOptions = [
    { 
      key: "DFAITH", 
      label: "D.FAITH", 
      symbol: "DFAITH",
      balance: dfaithBalance,
      icon: "🚀",
      color: "from-amber-400 to-yellow-500",
      description: "Faith Token"
    },
    { 
      key: "DINVEST", 
      label: "D.INVEST", 
      symbol: "DINVEST",
      balance: dinvestBalance,
      icon: "💎",
      color: "from-blue-400 to-blue-600",
      description: "Investment Token"
    },
    { 
      key: "ETH", 
      label: "Ethereum", 
      symbol: "ETH",
      balance: ethBalance,
      icon: "⟠",
      color: "from-purple-400 to-purple-600",
      description: "Native ETH"
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent mb-2">
          Token senden
        </h2>
        <p className="text-zinc-400 text-sm">Wähle einen Token und sende ihn sicher an eine andere Wallet</p>
      </div>

      {/* Wallet Status */}
      {!account?.address && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-center">
          <FaLock className="text-red-400 text-2xl mx-auto mb-2" />
          <p className="text-red-400 font-medium">Wallet nicht verbunden</p>
          <p className="text-red-300 text-sm">Verbinde deine Wallet um Token zu senden</p>
        </div>
      )}

      {account?.address && (
        <>
          {/* Token-Auswahl Grid */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <FaCoins className="text-amber-400" />
              Token auswählen:
            </label>
            <div className="grid gap-3">
              {tokenOptions.map((token) => (
                <div
                  key={token.key}
                  onClick={() => handleTokenSelect(token)}
                  className="relative cursor-pointer rounded-xl p-4 border-2 transition-all duration-200 bg-zinc-800/50 border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/70 hover:scale-[1.02]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-r ${token.color} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                        {getTokenIcon(token.key)}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-lg">{token.label}</h3>
                        <p className="text-zinc-400 text-xs">{token.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-amber-400 text-lg flex items-center gap-1">
                        {isLoadingBalances ? (
                          <span className="animate-spin">↻</span>
                        ) : (
                          token.balance
                        )}
                      </div>
                      <div className="text-zinc-500 text-xs font-medium">{token.symbol}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Transfer Modal */}
      <TokenTransferModal
        open={showTransferModal}
        onClose={() => {
          setShowTransferModal(false);
          setSelectedToken(null);
        }}
        token={selectedToken}
        onSend={handleSend}
        showSuccess={showSuccessModal}
        onSuccessClose={() => {
          setShowSuccessModal(false);
          setShowTransferModal(false);
          setSelectedToken(null);
        }}
      />
    </div>
  );
}
