import { useState } from "react";
import Header from "../../components/Header";
import HealthPredict from "../user/PredictionPage";
import BatchPredict from "./BatchPredict";

type PredictionTab = "non-clinical" | "clinical" | "batch";

const TABS: { id: PredictionTab; label: string }[] = [
  { id: "non-clinical", label: "Chế độ phi lâm sàng" },
  { id: "clinical", label: "Chế độ lâm sàng" },
  { id: "batch", label: "Dự đoán hàng loạt" },
];

export default function PatientPredictLayout() {
  const [activeTab, setActiveTab] = useState<PredictionTab>("non-clinical");

  return (
    <div className="dg-patient-predict">
      <Header
        title="Dự đoán cho bệnh nhân"
        subtitle="Thực hiện đánh giá và dự đoán nguy cơ cho bệnh nhân qua các chế độ khác nhau"
      />

      {/* Thanh 3 tab chuyển đổi nằm ngang giãn đều */}
      <div role="tablist" aria-label="Chế độ dự đoán cho bệnh nhân" className="mb-6 grid grid-cols-3 gap-3">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`predict-tab-${tab.id}`}
              aria-selected={active}
              aria-controls="predict-tabpanel"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f86e8]/60 ${
                active
                  ? "bg-gradient-to-br from-[#4f86e8] to-[#2fa8c4] text-white shadow-md shadow-sky-900/20"
                  : "border border-[#cfddf2] bg-white text-[#28395c] hover:bg-[#eef4fe] hover:text-[#1f4fae]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Nội dung đổi theo tab; hideHeader tránh lặp tiêu đề của từng trang con */}
      <div id="predict-tabpanel" role="tabpanel" aria-labelledby={`predict-tab-${activeTab}`} className="mt-4">
        {activeTab === "non-clinical" && <HealthPredict key="pt-nc" mode="nonclinical" target="patient" hideHeader />}
        {activeTab === "clinical" && <HealthPredict key="pt-c" mode="clinical" target="patient" hideHeader />}
        {activeTab === "batch" && <BatchPredict hideHeader />}
      </div>
    </div>
  );
}
