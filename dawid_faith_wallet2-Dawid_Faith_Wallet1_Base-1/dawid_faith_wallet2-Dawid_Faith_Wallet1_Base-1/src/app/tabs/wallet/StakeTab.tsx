import { useEffect, useState, useMemo } from "react";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { FaLock, FaUnlock, FaCoins, FaClock } from "react-icons/fa";
import { useActiveAccount } from "thirdweb/react";
import { createThirdwebClient, getContract, prepareContractCall, resolveMethod, readContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { useSendTransaction } from "thirdweb/react";
import { balanceOf, approve } from "thirdweb/extensions/erc20";

const STAKING_CONTRACT = "0xeB6f60E08AaAd7951896BdefC65cB789633BbeAd"; // Staking Contract NEU
const DFAITH_TOKEN = "0xeB6f60E08AaAd7951896BdefC65cB789633BbeAd"; // D.FAITH Token NEU (getauscht)
const DFAITH_DECIMALS = 2;
const DINVEST_TOKEN = "0x9D7a06c24F114f987d8C08f0fc8Aa422910F3902"; // D.INVEST Token NEU (getauscht)
const DINVEST_DECIMALS = 0;
const client = createThirdwebClient({ clientId: process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID! });

export default function StakeTab() {
  const account = useActiveAccount();
  const { mutate: sendTransaction, isPending } = useSendTransaction();
  const [stakeAmount, setStakeAmount] = useState("");
  const [activeTab, setActiveTab] = useState("stake");
  const [available, setAvailable] = useState("0");
  const [staked, setStaked] = useState("0");
  const [claimableRewards, setClaimableRewards] = useState("0");
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState(1);
  const [currentRewardRate, setCurrentRewardRate] = useState(0);
  const [totalRewardsDistributed, setTotalRewardsDistributed] = useState("0");
  const [totalStakedTokens, setTotalStakedTokens] = useState("0");
  const [userCount, setUserCount] = useState(0);
  const [dfaithBalance, setDfaithBalance] = useState("0.00");
  const [dinvestBalance, setDinvestBalance] = useState("0");
  const [stakeTimestamp, setStakeTimestamp] = useState<number>(0);
  const [canUnstake, setCanUnstake] = useState(false);
  const [timeUntilUnstake, setTimeUntilUnstake] = useState<number>(0);
  const [canClaim, setCanClaim] = useState(false);
  const [timeUntilNextClaim, setTimeUntilNextClaim] = useState<number>(0);
  const [minClaimAmount, setMinClaimAmount] = useState("0.01");

  // Korrekte API-Funktion für Balance-Abfrage auf Base Chain
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
      
      if (!res.ok) {
        console.error("Insight API Fehlerstatus:", res.status, res.statusText);
        throw new Error("API Error");
      }
      
      const data = await res.json();
      const balance = data?.data?.[0]?.balance ?? "0";
      return balance;
    } catch (e) {
      console.error("Insight API Fehler:", e);
      return "0";
    }
  };

  // Fetch balances und Contract-Status
  useEffect(() => {
    if (!account?.address) return;
    setLoading(true);
    (async () => {
      try {
        // D.INVEST Balance via Insight API (0 Decimals)
        const dinvestValue = await fetchTokenBalanceViaInsightApi(DINVEST_TOKEN, account.address);
        setAvailable(Math.floor(Number(dinvestValue)).toString());
        
        // Staking Contract Daten abrufen
        const staking = getContract({ client, chain: base, address: STAKING_CONTRACT });
        
        // Minimum Claim Amount abrufen
        try {
          const minClaim = await readContract({
            contract: staking,
            method: "function getMinClaimAmount() view returns (uint256)",
            params: []
          });
          // Contract gibt 1 zurück für 0.01 Token (da 2 Decimals)
          setMinClaimAmount((Number(minClaim) / Math.pow(10, 2)).toFixed(2));
        } catch (e) {
          console.error("Fehler beim Abrufen des Min Claim Amount:", e);
          setMinClaimAmount("0.01");
        }
        
        // User's Complete Stake Info abrufen (neue Funktion)
        try {
          const userInfo = await readContract({
            contract: staking,
            method: "function getUserStakeInfo(address) view returns (uint256, uint256, uint256, uint256, bool, uint256, bool)",
            params: [account.address]
          });
          
          // userInfo = [stakedAmount, claimableReward, stakeTimestamp, timeUntilUnstake, canUnstake, timeUntilNextClaim, canClaim]
          setStaked(userInfo[0].toString());
          setClaimableRewards((Number(userInfo[1]) / Math.pow(10, 2)).toFixed(2));
          setStakeTimestamp(Number(userInfo[2]));
          setTimeUntilUnstake(Number(userInfo[3]));
          setCanUnstake(userInfo[4]);
          setTimeUntilNextClaim(Number(userInfo[5]));
          setCanClaim(userInfo[6]);
        } catch (e) {
          console.error("Fehler beim Abrufen der User Stake Info:", e);
          setStaked("0");
          setClaimableRewards("0.00");
          setStakeTimestamp(0);
          setTimeUntilUnstake(0);
          setCanUnstake(false);
          setTimeUntilNextClaim(0);
          setCanClaim(false);
        }
        
        // Staking Status abrufen
        try {
          const stakingStatus = await readContract({
            contract: staking,
            method: "function getStakingStatus() view returns (uint8, uint256, uint256)",
            params: []
          });
          // Contract gibt Werte zurück: Rate ist in Prozent (z.B. 10 für 0.10%), aber als ganze Zahl
          setCurrentStage(Number(stakingStatus[0]));
          setCurrentRewardRate(Number(stakingStatus[1])); // Rate direkt verwenden (z.B. 10 für 0.10%)
          setTotalRewardsDistributed((Number(stakingStatus[2]) / Math.pow(10, 2)).toFixed(2));
        } catch (e) {
          console.error("Fehler beim Abrufen des Staking Status:", e);
        }
        
        // Total Staked Tokens und User Count
        try {
          const totalStaked = await readContract({
            contract: staking,
            method: "function totalStakedTokens() view returns (uint256)",
            params: []
          });
          setTotalStakedTokens(totalStaked.toString());
          
          const users = await readContract({
            contract: staking,
            method: "function userCount() view returns (uint256)",
            params: []
          });
          setUserCount(Number(users));
        } catch (e) {
          console.error("Fehler beim Abrufen der Contract Stats:", e);
        }
        
      } catch (e) {
        console.error("Fehler beim Abrufen der Daten:", e);
        setAvailable("0"); 
        setStaked("0"); 
        setClaimableRewards("0.00");
        setStakeTimestamp(0);
        setTimeUntilUnstake(0);
        setCanUnstake(false);
        setTimeUntilNextClaim(0);
        setCanClaim(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [account?.address, txStatus]);

  // D.FAITH und D.INVEST Balances abrufen
  useEffect(() => {
    if (!account?.address) {
      setDfaithBalance("0.00");
      setDinvestBalance("0");
      return;
    }
    // D.FAITH
    (async () => {
      try {
        const res = await fetch(`https://insight.thirdweb.com/v1/tokens?chain_id=8453&token_address=${DFAITH_TOKEN}&owner_address=${account.address}&include_native=true`);
        const data = await res.json();
        const bal = data?.data?.[0]?.balance ?? "0";
        setDfaithBalance((Number(bal) / Math.pow(10, DFAITH_DECIMALS)).toFixed(DFAITH_DECIMALS));
      } catch { setDfaithBalance("0.00"); }
    })();
    // D.INVEST
    (async () => {
      try {
        const res = await fetch(`https://insight.thirdweb.com/v1/tokens?chain_id=8453&token_address=${DINVEST_TOKEN}&owner_address=${account.address}&include_native=true`);
        const data = await res.json();
        const bal = data?.data?.[0]?.balance ?? "0";
        setDinvestBalance(Math.floor(Number(bal)).toString());
      } catch { setDinvestBalance("0"); }
    })();
  }, [account?.address]);

  // Stake Function (echtes Staking mit Approval-Check)
  const handleStake = async () => {
    if (!stakeAmount || parseInt(stakeAmount) <= 0 || !account?.address) {
      console.log("Ungültige Eingabe oder keine Wallet verbunden");
      return;
    }

    const amountToStakeNum = parseInt(stakeAmount);
    const availableNum = parseInt(available);

    if (amountToStakeNum > availableNum) {
      setTxStatus("error");
      console.log("Nicht genügend Token verfügbar");
      return;
    }

    // Minimum Staking Check (mindestens 1 Token)
    if (amountToStakeNum < 1) {
      setTxStatus("error");
      console.log("Mindestens 1 D.INVEST Token erforderlich");
      return;
    }

    setTxStatus("pending");

    try {
      const staking = getContract({ client, chain: base, address: STAKING_CONTRACT });
      const dinvest = getContract({ client, chain: base, address: DINVEST_TOKEN });
      const amountToStake = BigInt(amountToStakeNum);

      console.log("Staking Betrag:", amountToStakeNum);
      console.log("Aktuell gestaked:", staked);
      
      // 1. Aktuelle Allowance prüfen
      let allowance = BigInt(0);
      try {
        allowance = await readContract({
          contract: dinvest,
          method: "function allowance(address,address) view returns (uint256)",
          params: [account.address, STAKING_CONTRACT]
        });
        console.log("Aktuelle Allowance:", allowance.toString());
      } catch (e) {
        console.error("Fehler beim Abrufen der Allowance:", e);
        allowance = BigInt(0);
      }
      
      // 2. Approve, falls nötig (mit etwas Puffer)
      if (allowance < amountToStake) {
        console.log("Approval erforderlich");
        setTxStatus("approving");
        
        const approveTx = prepareContractCall({
          contract: dinvest,
          method: "function approve(address,uint256) returns (bool)",
          params: [STAKING_CONTRACT, amountToStake * BigInt(2)] // Etwas mehr für zukünftige Transaktionen
        });
        
        await new Promise<void>((resolve, reject) => {
          sendTransaction(approveTx, {
            onSuccess: () => {
              console.log("Approval erfolgreich");
              resolve();
            },
            onError: (error) => {
              console.error("Approval fehlgeschlagen:", error);
              reject(error);
            }
          });
        });
        
        // Kurz warten für Blockchain-Bestätigung
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // 3. Stake die Token
      console.log("Staking wird durchgeführt...");
      setTxStatus("staking");
      
      const stakeTx = prepareContractCall({
        contract: staking,
        method: "function stake(uint256)",
        params: [amountToStake]
      });
      
      await new Promise<void>((resolve, reject) => {
        sendTransaction(stakeTx, {
          onSuccess: () => {
            console.log("Staking erfolgreich");
            setTxStatus("success");
            setStakeAmount("");
            // Status nach 3 Sekunden zurücksetzen
            setTimeout(() => setTxStatus(null), 3000);
            resolve();
          },
          onError: (error) => {
            console.error("Staking fehlgeschlagen:", error);
            setTxStatus("error");
            setTimeout(() => setTxStatus(null), 5000);
            reject(error);
          }
        });
      });
      
    } catch (e) {
      console.error("Stake Fehler:", e);
      setTxStatus("error");
      setTimeout(() => setTxStatus(null), 5000);
    }
  };

  // Unstake Function (unstakes all)
  const handleUnstake = async () => {
    if (!account?.address || staked === "0" || !canUnstake) {
      console.log("Keine Token zum Unstaken verfügbar oder Mindestzeit nicht erreicht");
      return;
    }
    
    setTxStatus("pending");
    
    try {
      const staking = getContract({ client, chain: base, address: STAKING_CONTRACT });
      
      console.log("Unstaking alle Token:", staked);
      
      const unstakeTx = prepareContractCall({
        contract: staking,
        method: "function unstake()",
        params: []
      });
      
      await new Promise<void>((resolve, reject) => {
        sendTransaction(unstakeTx, {
          onSuccess: () => {
            console.log("Unstaking erfolgreich");
            setTxStatus("success");
            setTimeout(() => setTxStatus(null), 3000);
            resolve();
          },
          onError: (error) => {
            console.error("Unstaking fehlgeschlagen:", error);
            setTxStatus("error");
            setTimeout(() => setTxStatus(null), 5000);
            reject(error);
          }
        });
      });
      
    } catch (e) {
      console.error("Unstake Fehler:", e);
      setTxStatus("error");
      setTimeout(() => setTxStatus(null), 5000);
    }
  };

  // Claim Rewards Function
  const handleClaim = async () => {
    if (!account?.address || !canClaim) {
      console.log("Keine Rewards zum Einfordern verfügbar oder Mindestbetrag nicht erreicht");
      return;
    }
    
    setTxStatus("pending");
    
    try {
      const staking = getContract({ client, chain: base, address: STAKING_CONTRACT });
      
      console.log("Claim Rewards:", claimableRewards);
      
      const claimTx = prepareContractCall({
        contract: staking,
        method: "function claimReward()",
        params: []
      });
      
      await new Promise<void>((resolve, reject) => {
        sendTransaction(claimTx, {
          onSuccess: () => {
            console.log("Claim erfolgreich");
            setTxStatus("success");
            setTimeout(() => setTxStatus(null), 3000);
            resolve();
          },
          onError: (error) => {
            console.error("Claim fehlgeschlagen:", error);
            setTxStatus("error");
            setTimeout(() => setTxStatus(null), 5000);
            reject(error);
          }
        });
      });
      
    } catch (e) {
      console.error("Claim Fehler:", e);
      setTxStatus("error");
      setTimeout(() => setTxStatus(null), 5000);
    }
  };

  // Reward Rate formatieren - Contract gibt direkte Werte zurück (10 = 0.10%)
  const formatRewardRate = (rate: number) => {
    return (rate / 100).toFixed(2);
  };

  // Hilfsfunktion für den User-Reward pro Woche
  const getUserWeeklyReward = () => {
    // staked ist ein String, currentRewardRate ist direkt die Rate (z.B. 10 für 0.10%)
    const stakedNum = parseInt(staked) || 0;
    return ((stakedNum * currentRewardRate) / 100).toFixed(2);
  };

  // Hilfsfunktion: Formatiere Zeit in Sekunden zu lesbarer Form, mit Schutz gegen zu große Werte
  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "Jetzt verfügbar";
    // Wenn Zeitwert unrealistisch groß ist (z.B. > 10 Jahre), als nicht verfügbar anzeigen
    if (seconds > 10 * 365 * 24 * 60 * 60) return "Nicht verfügbar";
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    // Zeige nur die relevantesten Zeiteinheiten
    if (days > 0) {
      if (days >= 7) {
        const weeks = Math.floor(days / 7);
        const remainingDays = days % 7;
        if (remainingDays > 0) {
          return `${weeks} Woche${weeks > 1 ? 'n' : ''} ${remainingDays} Tag${remainingDays > 1 ? 'e' : ''}`;
        }
        return `${weeks} Woche${weeks > 1 ? 'n' : ''}`;
      }
      return `${days} Tag${days > 1 ? 'e' : ''} ${hours}h`;
    }
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes} Min`;
    return "Weniger als 1 Min";
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent mb-2">
          D.INVEST Staking
        </h2>
        <p className="text-zinc-400">Verdienen Sie kontinuierlich D.FAITH Token durch Staking</p>
      </div>

      {/* Staking Overview: Verfügbar, Gestaked, Reward */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-4 border border-zinc-700 text-center">
          <div className="text-sm text-zinc-500 mb-1">Verfügbar</div>
          <div className="text-xl font-bold text-amber-400">
            {loading ? "Laden..." : available}
          </div>
          <div className="text-xs text-zinc-500">D.INVEST</div>
        </div>
        <div className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-4 border border-zinc-700 text-center">
          <div className="text-sm text-zinc-500 mb-1">Gestaked</div>
          <div className="text-xl font-bold text-purple-400">
            {loading ? "Laden..." : staked}
          </div>
          <div className="text-xs text-zinc-500">D.INVEST</div>
        </div>
        <div className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-4 border border-zinc-700 text-center flex flex-col items-center justify-center">
          <div className="text-sm text-zinc-500 mb-1">Rewards</div>
          <div className="text-xl font-bold text-green-400 break-words max-w-full" style={{wordBreak:'break-word'}}>
            {claimableRewards}
          </div>
          <div className="text-xs text-zinc-500">D.FAITH</div>
        </div>
      </div>

      {/* Aktuelle Reward-Stufe */}
      <div className="bg-gradient-to-br from-blue-800/30 to-blue-900/30 rounded-xl p-4 border border-blue-700/50 mb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-blue-400">Aktuelle Reward-Stufe</div>
            <div className="text-xs text-zinc-500">
              {formatRewardRate(currentRewardRate)}% D.FAITH pro D.INVEST pro Woche
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-blue-400">Stufe {currentStage}</div>
            <div className="text-xs text-zinc-500">Total verteilt: {totalRewardsDistributed} D.FAITH</div>
          </div>
        </div>
      </div>

      {/* Stake/Unstake Tabs */}
      <div className="flex bg-zinc-800/50 rounded-xl p-1 mb-6">
        <button 
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
            activeTab === "stake" 
              ? "bg-amber-500/20 text-amber-400" 
              : "text-zinc-400 hover:text-zinc-300"
          }`}
          onClick={() => setActiveTab("stake")}
        >
          <FaLock className="inline mr-2" />
          Staken
        </button>
        <button 
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
            activeTab === "unstake" 
              ? "bg-amber-500/20 text-amber-400" 
              : "text-zinc-400 hover:text-zinc-300"
          }`}
          onClick={() => setActiveTab("unstake")}
        >
          <FaUnlock className="inline mr-2" />
          Unstaken
        </button>
      </div>

      {/* Stake Interface */}
      {activeTab === "stake" && (
        <div className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-6 border border-zinc-700 space-y-6">
          {/* Wichtiger Hinweis über kontinuierliche Rewards */}
          {parseInt(staked) > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-blue-400 text-xs">ℹ</span>
                </div>
                <div className="text-sm text-zinc-300">
                  <div className="font-medium">Kontinuierliche Rewards</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Sie verdienen kontinuierlich Rewards basierend auf Ihrer gestakten Menge. 
                    Mindest-Claim: {minClaimAmount} D.FAITH
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Eingabe und verfügbare Balance in einer Zeile */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-zinc-300">D.INVEST Betrag</label>
              <div className="flex items-center gap-2 bg-zinc-800/60 px-2 py-1 rounded-lg">
                <span className="text-xs text-zinc-500">Verfügbar:</span>
                <span className="text-xs font-bold text-amber-400">{loading ? "Laden..." : available}</span>
                <button 
                  className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition ml-2"
                  onClick={() => setStakeAmount(available)}
                  disabled={loading || parseInt(available) <= 0}
                >
                  MAX
                </button>
              </div>
            </div>
            <input 
              type="number"
              placeholder="0"
              className="w-full bg-zinc-900/80 border border-zinc-600 rounded-xl py-4 px-4 text-lg font-bold text-amber-400 focus:border-amber-500 focus:outline-none"
              value={stakeAmount}
              onChange={(e) => {
                const value = e.target.value;
                // Nur positive ganze Zahlen erlauben, mindestens 1
                if (value === "" || (Number(value) >= 0 && Number.isInteger(Number(value)))) {
                  setStakeAmount(value);
                }
              }}
              min="1"
              step="1"
            />
          </div>

          {/* Reward Vorschau für Eingabe */}
          {stakeAmount && parseInt(stakeAmount) > 0 && (
            <div className="bg-zinc-800/60 rounded-xl p-4 border border-zinc-700 flex flex-col items-center mt-2">
              <div className="text-xs text-zinc-400 mb-1">Ihr wöchentlicher Reward (Stufe {currentStage}):</div>
              <div className="text-2xl font-bold text-amber-400">
                {/* Reward pro Woche nach Contract-Logik: (amount * rate) / 100 */}
                {(() => {
                  const amount = parseInt(stakeAmount);
                  const rate = currentRewardRate;
                  if (isNaN(amount) || isNaN(rate)) return "-";
                  const reward = (amount * rate) / 100;
                  return reward.toFixed(2);
                })()} D.FAITH
              </div>
              {/* Nächster Reward verfügbar in ... */}
              <div className="text-xs text-zinc-500 mt-2">
                {(() => {
                  // Contract-Logik: rewardPerSecond = (amount * rate) / (100 * SECONDS_PER_WEEK)
                  const amount = parseInt(stakeAmount);
                  const rate = currentRewardRate;
                  const minClaim = Number(minClaimAmount);
                  const SECONDS_PER_WEEK = 604800;
                  if (isNaN(amount) || isNaN(rate) || isNaN(minClaim)) return "Reward aktuell nicht verfügbar";
                  const rewardPerSecond = (amount * rate) / (100 * SECONDS_PER_WEEK);
                  if (rewardPerSecond > 0) {
                    // Contract-Logik: Zeit bis minClaim = (MIN_CLAIM_AMOUNT * 100 * SECONDS_PER_WEEK) / (amount * rate)
                    const secondsToMinClaim = (minClaim * 100 * SECONDS_PER_WEEK) / (amount * rate);
                    // Hilfsfunktion für Zeitformatierung (aus dem Code oben)
                    const formatTime = (seconds: number) => {
                      if (seconds <= 0) return "Jetzt verfügbar";
                      if (seconds > 10 * 365 * 24 * 60 * 60) return "Nicht verfügbar";
                      const days = Math.floor(seconds / (24 * 60 * 60));
                      const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
                      const minutes = Math.floor((seconds % (60 * 60)) / 60);
                      if (days > 0) {
                        if (days >= 7) {
                          const weeks = Math.floor(days / 7);
                          const remainingDays = days % 7;
                          if (remainingDays > 0) {
                            return `${weeks} Woche${weeks > 1 ? 'n' : ''} ${remainingDays} Tag${remainingDays > 1 ? 'e' : ''}`;
                          }
                          return `${weeks} Woche${weeks > 1 ? 'n' : ''}`;
                        }
                        return `${days} Tag${days > 1 ? 'e' : ''} ${hours}h`;
                      }
                      if (hours > 0) return `${hours}h ${minutes}m`;
                      if (minutes > 0) return `${minutes} Min`;
                      return "Weniger als 1 Min";
                    };
                    return `Nächster Claim möglich in: ${formatTime(secondsToMinClaim)}`;
                  } else {
                    return "Reward aktuell nicht verfügbar";
                  }
                })()}
              </div>
            </div>
          )}

          <Button
            className="w-full bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-bold py-3 rounded-xl hover:opacity-90 transition-opacity mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!stakeAmount || parseInt(stakeAmount) <= 0 || parseInt(stakeAmount) > parseInt(available) || loading || txStatus === "pending" || txStatus === "approving" || txStatus === "staking"}
            onClick={handleStake}
          >
            <FaLock className="inline mr-2" />
            {txStatus === "approving" && "Approval läuft..."}
            {txStatus === "staking" && (parseInt(staked) > 0 ? "Token hinzufügen..." : "Staking läuft...")}
            {txStatus === "pending" && "Wird verarbeitet..."}
            {!txStatus && (!stakeAmount || parseInt(stakeAmount) <= 0) && "Betrag eingeben (min. 1)"}
            {!txStatus && stakeAmount && parseInt(stakeAmount) > parseInt(available) && "Nicht genügend Token"}
            {!txStatus && stakeAmount && parseInt(stakeAmount) > 0 && parseInt(stakeAmount) <= parseInt(available) && (
              parseInt(staked) > 0 
                ? `${stakeAmount} D.INVEST hinzufügen` 
                : `${stakeAmount} D.INVEST staken`
            )}
          </Button>

        {/* Status kompakt als Info-Box */}
        {(txStatus === "success" || txStatus === "error" || txStatus === "pending" || txStatus === "approving" || txStatus === "staking") && (
          <div className={`mt-4 p-3 rounded-lg text-center text-sm font-medium border ${
            txStatus === "success" ? "bg-green-500/20 text-green-400 border-green-500/30" :
            txStatus === "error" ? "bg-red-500/20 text-red-400 border-red-500/30" :
            txStatus === "pending" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
            txStatus === "approving" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
            txStatus === "staking" ? "bg-purple-500/20 text-purple-400 border-purple-500/30" :
            ""
          }`}>
            <div className="flex items-center justify-center gap-2">
              {(txStatus === "pending" || txStatus === "approving" || txStatus === "staking") && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
              )}
              <span>
                {txStatus === "success" && "✅ Transaktion erfolgreich abgeschlossen!"}
                {txStatus === "error" && "❌ Transaktion fehlgeschlagen! Bitte versuchen Sie es erneut."}
                {txStatus === "pending" && "⏳ Transaktion wird verarbeitet..."}
                {txStatus === "approving" && "🔐 Token-Genehmigung wird erteilt..."}
                {txStatus === "staking" && "🔒 Staking-Vorgang läuft..."}
              </span>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Unstake Interface */}
      {activeTab === "unstake" && (
        <div className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-6 border border-zinc-700 space-y-6">
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center">
                <span className="text-orange-400 text-xs">⚠</span>
              </div>
              <div className="text-sm text-zinc-300">
                <div className="font-medium">Vollständiges Unstaking</div>
                <div className="text-xs text-zinc-500 mt-1">
                  Alle gestakten Token ({staked} D.INVEST) werden unstaked.
                  Unstaking ist nur nach mindestens 7 Tagen möglich.
                  {!canUnstake && timeUntilUnstake > 0 && (
                    <span className="block text-orange-400 mt-1">
                      Unstaking möglich in: {formatTime(timeUntilUnstake)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {staked === "0" && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-blue-400 text-xs">ℹ</span>
                </div>
                <div className="text-sm text-zinc-400">
                  Sie haben derzeit keine D.INVEST Token gestaked.
                </div>
              </div>
            </div>
          )}

          <Button 
            className="w-full bg-zinc-700/50 hover:bg-zinc-600/50 text-zinc-300 font-bold py-3 rounded-xl border border-zinc-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={staked === "0" || loading || txStatus === "pending" || !canUnstake}
            onClick={handleUnstake}
          >
            <FaUnlock className="inline mr-2" />
            {txStatus === "pending" && "Wird verarbeitet..."}
            {!txStatus && staked === "0" && "Keine Token gestaked"}
            {!txStatus && staked !== "0" && !canUnstake && `Warten: ${formatTime(timeUntilUnstake)}`}
            {!txStatus && staked !== "0" && canUnstake && `Alle ${staked} D.INVEST unstaken`}
          </Button>
        </div>
      )}

      {/* Rewards Section */}
      <div className="bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 rounded-xl p-6 border border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-yellow-400 to-amber-600 rounded-full">
              <FaCoins className="text-black text-lg" />
            </div>
            <div>
              <h3 className="font-bold text-amber-400">Verfügbare Belohnungen</h3>
              <p className="text-xs text-zinc-500">
                {!canClaim && timeUntilNextClaim > 0 
                  ? `Nächster Claim in: ${formatTime(timeUntilNextClaim)}`
                  : `Kontinuierliche D.FAITH Belohnungen (min. ${minClaimAmount})`
                }
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-amber-400">{claimableRewards}</div>
            <div className="text-xs text-zinc-500">D.FAITH</div>
          </div>
        </div>
        
        <Button 
          className="w-full bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canClaim || loading || txStatus === "pending"}
          onClick={handleClaim}
        >
          <FaCoins className="inline mr-2" />
          {txStatus === "pending" ? "Wird verarbeitet..." : 
           !canClaim && timeUntilNextClaim > 0 ? `Warten: ${formatTime(timeUntilNextClaim)}` : 
           !canClaim ? `Mindestbetrag: ${minClaimAmount} D.FAITH` : 
           "Belohnungen einfordern"}
        </Button>
        {/* Status-Meldungen */}
        {(txStatus === "success" || txStatus === "error" || txStatus === "pending") && (
          <div className={`mt-3 p-3 rounded-lg text-center text-sm font-medium border ${
            txStatus === "success" ? "bg-green-500/20 text-green-400 border-green-500/30" :
            txStatus === "error" ? "bg-red-500/20 text-red-400 border-red-500/30" :
            txStatus === "pending" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
            ""
          }`}>
            <div className="flex items-center justify-center gap-2">
              {txStatus === "pending" && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
              )}
              <span>
                {txStatus === "success" && "✅ Belohnungen erfolgreich eingefordert!"}
                {txStatus === "error" && "❌ Fehler beim Einfordern der Belohnungen!"}
                {txStatus === "pending" && "⏳ Belohnungen werden eingefordert..."}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Contract Info */}
      <div className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-700">
        <div className="flex items-center gap-2 mb-2">
          <FaClock className="text-amber-400 text-sm" />
          <span className="text-sm font-medium text-zinc-300">Smart Contract Info</span>
        </div>
        <div className="text-xs text-zinc-500 space-y-1">
          <div>Staking Contract: {STAKING_CONTRACT}</div>
          <div>Network: Base (ETH)</div>
          <div>Staking Token: D.INVEST (0 Decimals)</div>
          <div>Reward Token: D.FAITH (2 Decimals)</div>
          <div>Reward System: Kontinuierliche Berechnung pro Sekunde</div>
          <div>Mindest-Claim: {minClaimAmount} D.FAITH</div>
          <div>Mindest-Staking-Zeit: 7 Tage</div>
          <div>Total Staked: {totalStakedTokens} D.INVEST</div>
        </div>
      </div>
    </div>
  );
}
