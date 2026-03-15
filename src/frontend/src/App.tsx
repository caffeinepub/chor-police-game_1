import { Toaster } from "@/components/ui/sonner";
import React from "react";
import AviatorGame from "./AviatorGame";

export default function App() {
  return (
    <>
      <AviatorGame />
      <Toaster position="top-center" />
    </>
  );
}
