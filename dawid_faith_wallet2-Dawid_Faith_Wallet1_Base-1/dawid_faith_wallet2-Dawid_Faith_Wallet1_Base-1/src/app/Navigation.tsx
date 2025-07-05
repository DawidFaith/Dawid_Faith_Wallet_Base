import Link from "next/link";
import {
  FaWallet,
  FaChartBar,
  FaTshirt,
  FaVideo,
  FaBroadcastTower,
  FaInstagram,
  FaTiktok,
  FaFacebook,
  FaMusic,
} from "react-icons/fa";
import { FiChevronDown } from "react-icons/fi";
import { SiSpotify } from "react-icons/si";
import { useState } from "react";

type NavigationProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
};

const socialIcons = {
  instagram: <FaInstagram size={22} className="text-pink-500" />,
  tiktok: <FaTiktok size={22} className="text-black dark:text-white" />,
  facebook: <FaFacebook size={22} className="text-blue-600" />,
};

export default function Navigation({ activeTab, setActiveTab }: NavigationProps) {
  const [open, setOpen] = useState(false);
  const [activeSocial, setActiveSocial] = useState<"instagram" | "tiktok" | "facebook">("instagram");

  return (
    <nav className="fixed top-0 left-0 w-full bg-zinc-900 border-b border-zinc-800 z-50">
      <ul className="flex justify-center items-center gap-8 py-3">
        {/* Tokenomics */}
        <li>
          <button
            title="Tokenomics"
            onClick={() => setActiveTab("tokenomics")}
            className="flex items-center"
          >
            <FaChartBar
              size={22}
              className={`transition-colors ${
                activeTab === "tokenomics" ? "text-yellow-400" : "text-zinc-400"
              } hover:text-yellow-400`}
            />
          </button>
        </li>
        {/* Wallet */}
        <li>
          <button
            title="Wallet"
            onClick={() => setActiveTab("wallet")}
            className="flex items-center"
          >
            <FaWallet
              size={22}
              className={`transition-colors ${
                activeTab === "wallet" ? "text-blue-400" : "text-zinc-400"
              } hover:text-blue-400`}
            />
          </button>
        </li>
        {/* Social Media Icon + Dropdown */}
        <li className="relative flex items-center">
          <button
            title="Social Media"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center"
            aria-haspopup="true"
            aria-expanded={open}
          >
            {socialIcons[activeSocial]}
            <FiChevronDown
              size={22}
              className={`ml-1 transition-transform duration-300 ${
                open ? "text-pink-400 rotate-180" : "text-zinc-400"
              } hover:text-pink-400`}
            />
          </button>
          {open && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-3 bg-zinc-800 rounded-lg shadow-xl flex flex-col z-50 min-w-[140px] border border-zinc-700 overflow-hidden">
              {activeSocial !== "instagram" && (
                <button
                  onClick={() => {
                    setOpen(false);
                    setActiveSocial("instagram");
                    setActiveTab("instagram");
                  }}
                  className="flex items-center gap-2 px-4 py-3 hover:bg-zinc-700 text-zinc-100 w-full transition-colors duration-200 border-b border-zinc-700"
                >
                  <FaInstagram className="text-pink-500" /> 
                  <span className="font-medium">Instagram</span>
                </button>
              )}
              {activeSocial !== "tiktok" && (
                <button
                  onClick={() => {
                    setActiveSocial("tiktok");
                    setActiveTab("tiktok");
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 px-4 py-3 hover:bg-zinc-700 text-zinc-100 w-full transition-colors duration-200 border-b border-zinc-700"
                >
                  <FaTiktok className="text-zinc-100" /> 
                  <span className="font-medium">TikTok</span>
                </button>
              )}
              {activeSocial !== "facebook" && (
                <button
                  onClick={() => {
                    setActiveSocial("facebook");
                    setActiveTab("facebook");
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 px-4 py-3 hover:bg-zinc-700 text-zinc-100 w-full transition-colors duration-200"
                >
                  <FaFacebook className="text-blue-600" /> 
                  <span className="font-medium">Facebook</span>
                </button>
              )}
            </div>
          )}
        </li>
        {/* Merch */}
        <li>
          <button
            title="Merch"
            onClick={() => setActiveTab("merch")}
            className="flex items-center"
          >
            <FaTshirt
              size={22}
              className={`transition-colors ${
                activeTab === "merch" ? "text-green-400" : "text-zinc-400"
              } hover:text-green-400`}
            />
          </button>
        </li>
        {/* Stream */}
        <li>
          <button
            title="Stream"
            onClick={() => setActiveTab("stream")}
            className="flex items-center"
          >
            <SiSpotify
              size={22}
              className={`transition-colors ${
                activeTab === "stream" ? "text-green-500" : "text-zinc-400"
              } hover:text-green-500`}
            />
          </button>
        </li>
        {/* Live */}
        <li>
          <button
            title="Live"
            onClick={() => setActiveTab("live")}
            className="flex items-center"
          >
            <FaMusic
              size={22}
              className={`transition-colors ${
                activeTab === "live" ? "text-purple-400" : "text-zinc-400"
              } hover:text-purple-400`}
            />
          </button>
        </li>
      </ul>
    </nav>
  );
}