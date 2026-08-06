import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { ScheduleProvider } from "@/state/ScheduleContext";
import Home from "@/pages/Home";
import Classroom from "@/pages/Classroom";
import MindMap from "@/pages/MindMap";
import CodeReader from "@/pages/CodeReader";
import ConstraintLab from "@/pages/ConstraintLab";
import MathLab from "@/pages/MathLab";
import SolverPage from "@/pages/SolverPage";
import Cards from "@/pages/Cards";

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <ScheduleProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/learn" element={<Classroom />} />
              <Route path="/map" element={<MindMap />} />
              <Route path="/code" element={<CodeReader />} />
              <Route path="/lab" element={<ConstraintLab />} />
              <Route path="/math" element={<MathLab />} />
              <Route path="/solve" element={<SolverPage />} />
              <Route path="/cards" element={<Cards />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
        <Toaster theme="dark" position="bottom-right" />
      </ScheduleProvider>
    </TooltipProvider>
  );
}
