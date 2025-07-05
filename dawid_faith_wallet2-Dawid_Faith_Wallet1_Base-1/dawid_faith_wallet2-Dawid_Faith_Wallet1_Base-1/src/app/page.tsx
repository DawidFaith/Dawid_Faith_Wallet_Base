"use client";

import { useState } from "react";
import Navigation from "./Navigation";
import WalletTab from "./tabs/WalletTab";
import TokenomicsTab from "./tabs/TokenomicsTab";
import MerchTab from "./tabs/MerchTab";
import StreamTab from "./tabs/StreamTab";
import LiveTab from "./tabs/LiveTab";
import InstagramTab from "./tabs/InstagramTab";
import TiktokTab from "./tabs/TiktokTab";
import FacebookTab from "./tabs/FacebookTab";

export default function Home() {
  const [activeTab, setActiveTab] = useState("wallet");

  return (
    <main className="min-h-screen flex flex-col bg-zinc-950">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      <section className="flex-1 flex flex-col items-center justify-center pt-24 pb-8">
        {activeTab === "wallet" && <WalletTab />}
        {activeTab === "tokenomics" && <TokenomicsTab />}
        {activeTab === "merch" && <MerchTab />}
        {activeTab === "stream" && <StreamTab />}
        {activeTab === "live" && <LiveTab />}
        {activeTab === "instagram" && <InstagramTab />}
        {activeTab === "tiktok" && <TiktokTab />}
        {activeTab === "facebook" && <FacebookTab />}
      </section>
    </main>
  );
}


