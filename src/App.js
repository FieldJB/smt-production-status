import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  PlayCircle,
  X,
  UploadCloud,
  Inbox,
  Trash2,
  LayoutDashboard,
  History,
  Search,
  Lock,
  ArrowRight,
  LogOut,
} from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const CELLS = ["Cell 1", "Cell 2", "Cell 3", "Cell 4", "Cell 5A", "Cell 5B"];

// --- Helper: Get Current Monday (Local Timezone Safe) ---
const getMonday = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d.setDate(diff));

  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// --- Smart Status Engine ---
const calculateStatus = (wo, targetDay) => {
  if (wo.qtyOut >= wo.qtyPlanned && wo.qtyPlanned > 0) return "completed";
  if (targetDay === "Unscheduled") return "queued";

  const currentDayIndex = new Date().getDay() - 1;
  let todayIdx = currentDayIndex;
  if (todayIdx < 0) todayIdx = 0;
  if (todayIdx > 4) todayIdx = 4;

  const targetIdx = DAYS.indexOf(targetDay);
  if (targetIdx < todayIdx) return "delayed";
  if (targetIdx === todayIdx) return "running";
  return "queued";
};

export default function App() {
  // Inject Tailwind CDN
  useEffect(() => {
    if (!document.getElementById("tailwind-cdn")) {
      const script = document.createElement("script");
      script.id = "tailwind-cdn";
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  // --- Login States ---
  const [isAppLocked, setIsAppLocked] = useState(true);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  // --- Local Storage States ---
  const [workOrders, setWorkOrders] = useState(() => {
    const saved = localStorage.getItem("smt-work-orders");
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    // Automatically refresh statuses on load so past days shift to "Delayed" correctly
    return parsed.map((wo) => {
      if (wo.status !== "completed" && !wo.archived) {
        return { ...wo, status: calculateStatus(wo, wo.day) };
      }
      return wo;
    });
  });

  const [activeWeek, setActiveWeek] = useState(() => {
    const saved = localStorage.getItem("smt-active-week");
    return saved || getMonday();
  });

  const [activeView, setActiveView] = useState("dashboard");
  const [historySearch, setHistorySearch] = useState("");
  const [selectedWos, setSelectedWos] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWo, setEditingWo] = useState(null);
  const [userRole, setUserRole] = useState("Admin");

  const fileInputRef = useRef(null);
  const mainContainerRef = useRef(null);

  // --- Data Persistence Effect ---
  useEffect(() => {
    localStorage.setItem("smt-work-orders", JSON.stringify(workOrders));
  }, [workOrders]);

  useEffect(() => {
    localStorage.setItem("smt-active-week", activeWeek);
  }, [activeWeek]);

  // --- Login & Logout Handlers ---
  const handleLogin = (e) => {
    e.preventDefault();
    if (loginUser === "smt" && loginPass === "smt") {
      setIsAppLocked(false);
      setLoginError("");
    } else {
      setLoginError("Invalid username or password. Please try again.");
    }
  };

  const handleLogout = () => {
    setIsAppLocked(true);
    setLoginUser("");
    setLoginPass("");
    setActiveView("dashboard");
  };

  // --- Synchronized Auto-Reset on New Monday Effect ---
  useEffect(() => {
    const checkWeekResetAndStatus = () => {
      const currentMonday = getMonday();
      if (currentMonday !== activeWeek) {
        // A new week has started! Archive all current dashboard items
        setWorkOrders((prev) => prev.map((wo) => ({ ...wo, archived: true })));
        setActiveWeek(currentMonday);
        setSelectedWos([]); // Clear any selections
      } else {
        // Same week, but let's re-evaluate daily statuses in case the day changed overnight
        setWorkOrders((prev) => {
          let hasChanges = false;
          const updated = prev.map((wo) => {
            if (wo.status !== "completed" && !wo.archived) {
              const newStatus = calculateStatus(wo, wo.day);
              if (newStatus !== wo.status) {
                hasChanges = true;
                return { ...wo, status: newStatus };
              }
            }
            return wo;
          });
          return hasChanges ? updated : prev;
        });
      }
    };

    checkWeekResetAndStatus(); // Check immediately on load
    const interval = setInterval(checkWeekResetAndStatus, 3600000); // Check every 1 hour while open
    return () => clearInterval(interval);
  }, [activeWeek]);

  // --- Derived Data ---
  // Dashboard only shows non-archived jobs
  const dashboardOrders = workOrders.filter((wo) => !wo.archived);
  const unscheduledOrders = dashboardOrders.filter(
    (wo) => wo.cell === "Unscheduled"
  );

  // History shows ALL completed jobs
  const completedOrders = workOrders.filter((wo) => wo.status === "completed");
  const filteredHistory = completedOrders
    .filter(
      (wo) =>
        wo.modelName.toLowerCase().includes(historySearch.toLowerCase()) ||
        wo.woNumber.toLowerCase().includes(historySearch.toLowerCase())
    )
    .sort(
      (a, b) =>
        new Date(b.completedAt || b.targetDate) -
        new Date(a.completedAt || a.targetDate)
    );

  const [formData, setFormData] = useState({
    id: "",
    cell: "Cell 1",
    day: "Monday",
    woNumber: "",
    modelName: "",
    qtyPlanned: "",
    qtyIn: "",
    qtyOut: "",
    targetDate: "",
    deadline: "",
    status: "queued",
    completedAt: null,
    archived: false,
  });

  const isPlanDisabled = userRole === "VMI";
  const isActualDisabled = userRole === "Prepare";
  const inputClass = (disabled) =>
    `w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#e04616] focus:border-[#e04616] focus:outline-none ${
      disabled
        ? "bg-slate-100 text-slate-500 cursor-not-allowed opacity-70"
        : ""
    }`;

  const formatDateShort = (dateString) => {
    if (!dateString) return "";
    const cleanDate = dateString.split("T")[0];
    const date = new Date(cleanDate + "T12:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleOpenModal = (cell, day, existingWo = null) => {
    if (!existingWo && userRole === "VMI") return;
    if (existingWo) {
      setFormData(existingWo);
    } else {
      const today = new Date().toISOString().split("T")[0];
      const newForm = {
        id: Date.now().toString(),
        cell: cell,
        day: day,
        woNumber: "",
        modelName: "",
        qtyPlanned: "",
        qtyIn: "",
        qtyOut: "",
        targetDate: today,
        deadline: today,
        status: "queued",
        completedAt: null,
        archived: false,
      };
      newForm.status = calculateStatus(newForm, day);
      if (newForm.status === "completed")
        newForm.completedAt = new Date().toISOString();
      setFormData(newForm);
    }
    setEditingWo(existingWo);
    setIsModalOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    setWorkOrders((prev) => {
      // Filter out the item currently being edited, AND any item matching the new WO + Model
      const updatedList = prev.filter((wo) => {
        const isCurrentEdit = editingWo && wo.id === editingWo.id;
        const isDuplicateWoModel =
          wo.woNumber === formData.woNumber &&
          wo.modelName === formData.modelName &&
          !wo.archived;
        return !isCurrentEdit && !isDuplicateWoModel;
      });
      return [...updatedList, formData];
    });
    setIsModalOpen(false);
  };

  const handleDelete = () => {
    if (editingWo) {
      setWorkOrders((prev) => prev.filter((wo) => wo.id !== formData.id));
      setIsModalOpen(false);
    }
  };

  const handleBulkDelete = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${selectedWos.length} selected plan(s)?`
      )
    ) {
      setWorkOrders((prev) =>
        prev.filter((wo) => !selectedWos.includes(wo.id))
      );
      setSelectedWos([]);
    }
  };

  const handleDeleteAllUnscheduled = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ALL ${unscheduledOrders.length} unscheduled plan(s)?`
      )
    ) {
      setWorkOrders((prev) =>
        prev.filter((wo) => wo.cell !== "Unscheduled" || wo.archived)
      );
      setSelectedWos((prev) =>
        prev.filter((id) => !unscheduledOrders.find((wo) => wo.id === id))
      );
    }
  };

  const parseCustomDate = (dateStr) => {
    if (!dateStr) return null;
    if (!isNaN(new Date(dateStr).getTime())) {
      return new Date(dateStr).toISOString().split("T")[0];
    }
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const monthStr = parts[1].toLowerCase();
      let year = parts[2];
      if (year.length === 2) year = `20${year}`;
      const months = {
        jan: "01",
        feb: "02",
        mar: "03",
        apr: "04",
        may: "05",
        jun: "06",
        jul: "07",
        aug: "08",
        sep: "09",
        oct: "10",
        nov: "11",
        dec: "12",
      };
      const month = months[monthStr];
      if (month) return `${year}-${month}-${day}`;
    }
    return null;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;

        const parseCSVLine = (line) => {
          const result = [];
          let currentCell = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && line[i + 1] === '"') {
              currentCell += '"';
              i++;
            } else if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === "," && !inQuotes) {
              result.push(currentCell.trim());
              currentCell = "";
            } else {
              currentCell += char;
            }
          }
          result.push(currentCell.trim());
          return result;
        };

        const lines = text.split(/\r\n|\n|\r/);

        if (lines.length < 4) {
          alert(
            "File seems to be empty or missing data rows. Please check the file format."
          );
          e.target.value = null;
          return;
        }

        const colMap = { model: 2, wo: 6, plan: 10, planShip: 15 };
        let skippedRowsCount = 0;
        let importedCount = 0;
        const newOrders = [];

        for (let i = 3; i < lines.length; i++) {
          const rawLine = lines[i];
          if (!rawLine.trim() || rawLine.replace(/,/g, "").trim() === "")
            continue;

          const cols = parseCSVLine(rawLine);
          const model = cols[colMap.model] || "";
          const wo = cols[colMap.wo] || "";
          const planStr = cols[colMap.plan] || "";
          const planShip = cols[colMap.planShip] || "";

          if (!model || !wo || !planStr) continue;

          const qtyPlanned = parseInt(planStr.replace(/,/g, ""), 10);
          if (isNaN(qtyPlanned) || qtyPlanned <= 0) {
            skippedRowsCount++;
            continue;
          }

          let parsedTargetDate =
            parseCustomDate(planShip) || new Date().toISOString().split("T")[0];

          const newWo = {
            id: `import-${Date.now()}-${i}`,
            cell: "Unscheduled",
            day: "Unscheduled",
            woNumber: wo,
            modelName: model,
            qtyPlanned: qtyPlanned,
            qtyIn: 0,
            qtyOut: 0,
            targetDate: parsedTargetDate,
            deadline: parsedTargetDate,
            status: "queued",
            completedAt: null,
            archived: false,
          };

          newWo.status = calculateStatus(newWo, "Unscheduled");
          if (newWo.status === "completed")
            newWo.completedAt = new Date().toISOString();

          newOrders.push(newWo);
          importedCount++;
        }

        if (importedCount === 0) {
          alert(
            "File read successfully, but no valid data rows were found.\nPlease ensure data starts at row 4 and quantities are > 0."
          );
          e.target.value = null;
          return;
        }

        setWorkOrders((prev) => [...prev, ...newOrders]);

        let successMsg = `Successfully imported ${importedCount} production plans.`;
        if (skippedRowsCount > 0) {
          successMsg += `\n(Ignored ${skippedRowsCount} rows with 0 or missing quantities.)`;
        }
        alert(successMsg);
      } catch (error) {
        console.error("Error parsing CSV:", error);
        alert("An error occurred while reading the file.");
      } finally {
        e.target.value = null;
      }
    };
    reader.onerror = () => {
      alert("Failed to read the file. Please try again.");
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const handleDragStart = (e, woId) => {
    e.dataTransfer.setData("woId", woId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const speed = 15;
    const buffer = 80;

    if (mainContainerRef.current) {
      const rect = mainContainerRef.current.getBoundingClientRect();
      if (e.clientX - rect.left < buffer) {
        mainContainerRef.current.scrollLeft -= speed;
      } else if (rect.right - e.clientX < buffer) {
        mainContainerRef.current.scrollLeft += speed;
      }
    }

    if (e.clientY < buffer) {
      window.scrollBy(0, -speed);
    } else if (window.innerHeight - e.clientY < buffer) {
      window.scrollBy(0, speed);
    }
  };

  const handleDrop = (e, targetCell, targetDay) => {
    e.preventDefault();
    const woId = e.dataTransfer.getData("woId");
    if (!woId) return;

    setWorkOrders((prev) =>
      prev.map((wo) => {
        if (wo.id === woId) {
          const updatedWo = { ...wo, cell: targetCell, day: targetDay };
          const newStatus = calculateStatus(updatedWo, targetDay);

          if (newStatus === "completed" && wo.status !== "completed") {
            updatedWo.completedAt = new Date().toISOString();
          }

          updatedWo.status = newStatus;
          return updatedWo;
        }
        return wo;
      })
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "running":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "delayed":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 mr-1" />;
      case "running":
        return <PlayCircle className="w-4 h-4 mr-1" />;
      case "delayed":
        return <AlertTriangle className="w-4 h-4 mr-1" />;
      default:
        return <Clock className="w-4 h-4 mr-1" />;
    }
  };

  const getCellQueueInfo = (cellName) => {
    const cellWos = dashboardOrders.filter((wo) => wo.cell === cellName);
    const running =
      cellWos.find((wo) => wo.status === "running") ||
      cellWos.find((wo) => wo.status === "delayed");
    const queued = cellWos
      .filter((wo) => wo.status === "queued")
      .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day))[0];
    return { running, queued };
  };

  const renderWorkOrderCard = (wo, isTray = false) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const isTargetPassed = wo.targetDate < todayStr;
    const isSelected = selectedWos.includes(wo.id);

    return (
      <div
        key={wo.id}
        onClick={() => handleOpenModal(wo.cell, wo.day, wo)}
        draggable={userRole !== "VMI"}
        onDragStart={(e) => handleDragStart(e, wo.id)}
        className={`border rounded-lg shadow-sm ${
          userRole !== "VMI"
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-pointer"
        } hover:shadow-md transition-shadow text-xs overflow-hidden flex flex-col bg-white ${
          isSelected
            ? "border-[#e04616] ring-1 ring-[#e04616]"
            : "border-slate-200"
        } ${isTray ? "min-w-[220px] shrink-0" : ""}`}
      >
        {/* PLAN ROW */}
        <div className="bg-slate-100 p-2 border-b border-slate-200 relative">
          {isTray && userRole !== "VMI" && (
            <div className="absolute top-2 right-2 z-10">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-[#e04616] cursor-pointer"
                checked={isSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  setSelectedWos((prev) =>
                    prev.includes(wo.id)
                      ? prev.filter((id) => id !== wo.id)
                      : [...prev, wo.id]
                  );
                }}
              />
            </div>
          )}

          <div
            className={`flex justify-between items-start mb-1 gap-2 ${
              isTray ? "pr-5" : ""
            }`}
          >
            <span
              className="font-bold text-slate-800 truncate"
              title={wo.modelName}
            >
              {wo.modelName}
            </span>
            {!isTray && (
              <span className="text-slate-500 font-medium text-[10px] uppercase bg-slate-200 px-1.5 py-0.5 rounded shrink-0">
                Plan
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mb-1">
            {wo.woNumber}
          </div>
          <div className="flex justify-between items-center text-slate-600 mt-1">
            <span className="text-xs">
              Qty: <span className="font-semibold">{wo.qtyPlanned}</span>
            </span>
            <span
              className={`text-xs font-semibold flex items-center ${
                wo.status === "delayed" || isTargetPassed
                  ? "text-red-600"
                  : "text-slate-700"
              }`}
            >
              Target: {formatDateShort(wo.targetDate)}
              {isTargetPassed && (
                <AlertTriangle
                  className="w-3 h-3 text-red-500 ml-1"
                  title="Target date has passed"
                />
              )}
            </span>
          </div>
          <div className="flex justify-end mt-0.5">
            <span
              className={`text-[9px] flex items-center gap-1 ${
                wo.targetDate > wo.deadline
                  ? "text-red-500 font-bold"
                  : "text-slate-400"
              }`}
            >
              {wo.targetDate > wo.deadline && (
                <AlertTriangle className="w-3 h-3" />
              )}
              Deadline: {formatDateShort(wo.deadline)}
            </span>
          </div>
        </div>

        {/* ACTUAL ROW */}
        <div className="p-2 bg-white relative">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-800 font-medium">Actual</span>
            <span
              className={`px-2 py-0.5 rounded-full flex items-center text-[10px] font-bold uppercase border ${getStatusColor(
                wo.status
              )}`}
            >
              {getStatusIcon(wo.status)}
              {wo.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-slate-50 p-1 rounded border border-slate-100">
              <div className="text-slate-400 text-[10px] uppercase">Input</div>
              <div className="font-bold text-slate-700">{wo.qtyIn}</div>
            </div>
            <div
              className={`p-1 rounded border ${
                wo.qtyOut >= wo.qtyPlanned && wo.qtyPlanned > 0
                  ? "bg-green-50 border-green-100"
                  : "bg-slate-50 border-slate-100"
              }`}
            >
              <div className="text-slate-400 text-[10px] uppercase">Output</div>
              <div
                className={`font-bold ${
                  wo.qtyOut >= wo.qtyPlanned && wo.qtyPlanned > 0
                    ? "text-green-700"
                    : "text-slate-700"
                }`}
              >
                {wo.qtyOut}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // === RENDER LOGIN SCREEN IF LOCKED ===
  if (isAppLocked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans relative z-0">
        {/* Decorative Background Element (Replaces the empty void) */}
        <div className="absolute top-0 left-0 w-full h-96 bg-orange-600 transform -skew-y-2 origin-top-left -z-10 shadow-lg"></div>

        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100 z-10">
          {/* Redesigned Clean White Header with Official Focuz Logo */}
          <div className="p-8 border-b border-gray-100 flex flex-col items-start bg-white">
            <svg
              viewBox="0 0 280 60"
              className="h-12 w-auto mb-4"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polygon points="0,60 15,0 35,0 20,60" fill="#e04616" />
              <text
                x="45"
                y="40"
                fontFamily="Georgia, serif"
                fontStyle="italic"
                fontWeight="bold"
                fontSize="42"
                fill="#e04616"
              >
                Focuz
              </text>
              <text
                x="50"
                y="55"
                fontFamily="Arial, sans-serif"
                fontWeight="bold"
                fontSize="11"
                fill="#475569"
                letterSpacing="1"
              >
                MANUFACTURING SERVICES
              </text>
            </svg>
            <p className="text-orange-600 text-xs font-bold uppercase tracking-wider mt-1 flex items-center gap-1">
              <Lock size={12} /> Authorized Access Only
            </p>
          </div>

          <form onSubmit={handleLogin} className="p-8 space-y-6 bg-slate-50/50">
            {loginError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold flex items-center gap-2 border border-red-100">
                <AlertTriangle size={16} />
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className="w-full p-3 pl-4 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none transition-all"
                placeholder="Username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                className="w-full p-3 pl-4 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none transition-all"
                placeholder="••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-orange-200 transition-all flex justify-center items-center gap-2"
            >
              Access Dashboard <ArrowRight size={20} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-100 text-slate-800 font-sans selection:bg-[#e04616]/20 flex flex-col"
      onDragOver={handleDragOver}
    >
      <input
        type="file"
        accept=".csv"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      <header className="bg-white border-b-4 border-[#e04616] px-4 py-3 sm:px-6 sm:py-4 shadow-sm sticky top-0 z-20 flex flex-wrap lg:flex-nowrap justify-between items-center gap-4 overflow-visible w-full">
        <div className="flex items-center gap-4 shrink-0">
          <svg
            viewBox="0 0 280 60"
            className="h-10 sm:h-12 w-auto shrink-0"
            xmlns="http://www.w3.org/2000/svg"
          >
            <polygon points="0,60 15,0 35,0 20,60" fill="#e04616" />
            <text
              x="45"
              y="40"
              fontFamily="Georgia, serif"
              fontStyle="italic"
              fontWeight="bold"
              fontSize="42"
              fill="#e04616"
            >
              Focuz
            </text>
            <text
              x="50"
              y="55"
              fontFamily="Arial, sans-serif"
              fontWeight="bold"
              fontSize="11"
              fill="#475569"
              letterSpacing="1"
            >
              MANUFACTURING SERVICES
            </text>
          </svg>
          <div className="border-l-2 border-gray-200 pl-4 shrink-0">
            <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wider mt-0.9 text-slate-700 whitespace-nowrap">
              SMT Schedule dashboard
            </h1>
            <p className="text-[#e04616] text-[10px] sm:text-xs font-bold uppercase tracking-wider mt-0.5 whitespace-nowrap">
              Production plan{" "}
            </p>
          </div>

          <div className="hidden md:flex ml-2 items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
            <button
              onClick={() => setActiveView("dashboard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-bold transition-all ${
                activeView === "dashboard"
                  ? "bg-white shadow-sm text-[#e04616]"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </button>
            <button
              onClick={() => setActiveView("history")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-bold transition-all ${
                activeView === "history"
                  ? "bg-white shadow-sm text-[#e04616]"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <History className="w-4 h-4" /> History Log
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm font-medium shrink-0 ml-auto">
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-4 py-1.5 rounded-md transition-colors shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>

          <select
            value={userRole}
            onChange={(e) => setUserRole(e.target.value)}
            className="bg-slate-50 border border-slate-300 text-slate-700 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#e04616] sm:mr-2"
          >
            <option value="Admin">Role: Admin (All Access)</option>
            <option value="Prepare">Role: Prepare Team (Plan Only)</option>
            <option value="VMI">Role: VMI Team (Actuals Only)</option>
          </select>
        </div>

        <div className="md:hidden w-full flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 mt-2">
          <button
            onClick={() => setActiveView("dashboard")}
            className={`flex-1 flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeView === "dashboard"
                ? "bg-white shadow-sm text-[#e04616]"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </button>
          <button
            onClick={() => setActiveView("history")}
            className={`flex-1 flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeView === "history"
                ? "bg-white shadow-sm text-[#e04616]"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <History className="w-4 h-4" /> History Log
          </button>
        </div>
      </header>

      {/* ========================================= */}
      {/* DASHBOARD VIEW               */}
      {/* ========================================= */}
      {activeView === "dashboard" && (
        <>
          <main
            ref={mainContainerRef}
            className="p-4 overflow-x-auto flex-1 relative"
            onDragOver={handleDragOver}
          >
            <div className="min-w-[1200px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-6 border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold text-sm uppercase tracking-wider">
                <div className="p-4 border-r border-slate-200 text-center">
                  Cell / Queue
                </div>
                {DAYS.map((day) => (
                  <div
                    key={day}
                    className="p-4 border-r border-slate-200 text-center last:border-r-0"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {CELLS.map((cell) => {
                const queueInfo = getCellQueueInfo(cell);

                return (
                  <div
                    key={cell}
                    className="grid grid-cols-6 border-b border-slate-200 last:border-b-0 hover:bg-slate-50 transition-colors"
                  >
                    <div className="p-4 border-r border-slate-200 bg-white flex flex-col justify-center">
                      <h2 className="text-lg font-bold text-slate-800 mb-3">
                        {cell}
                      </h2>

                      <div className="space-y-2 text-xs">
                        <div className="bg-blue-50 border border-blue-100 rounded p-2">
                          <div className="text-blue-800 font-semibold mb-1 flex items-center">
                            <PlayCircle className="w-3 h-3 mr-1" /> Current
                          </div>
                          {queueInfo.running ? (
                            <div
                              className="font-bold text-slate-800 truncate"
                              title={queueInfo.running.modelName}
                            >
                              {queueInfo.running.modelName}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Idle</span>
                          )}
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded p-2">
                          <div className="text-slate-600 font-semibold mb-1 flex items-center">
                            <Clock className="w-3 h-3 mr-1" /> Next Queue
                          </div>
                          {queueInfo.queued ? (
                            <div
                              className="font-bold text-slate-800 truncate"
                              title={queueInfo.queued.modelName}
                            >
                              {queueInfo.queued.modelName}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">None</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {DAYS.map((day) => {
                      const dayWos = dashboardOrders.filter(
                        (wo) => wo.cell === cell && wo.day === day
                      );

                      return (
                        <div
                          key={`${cell}-${day}`}
                          className="border-r border-slate-200 last:border-r-0 p-2 flex flex-col gap-2 min-h-[160px]"
                          onDragOver={handleDragOver}
                          onDrop={(e) => {
                            if (userRole !== "VMI") handleDrop(e, cell, day);
                          }}
                        >
                          {dayWos.length > 0 ? (
                            dayWos.map((wo) => renderWorkOrderCard(wo))
                          ) : userRole !== "VMI" ? (
                            <div
                              onClick={() => handleOpenModal(cell, day)}
                              className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#e04616] hover:border-[#e04616] hover:bg-[#e04616]/5 transition-colors cursor-pointer group min-h-[120px]"
                            >
                              <Plus className="w-6 h-6 opacity-50 group-hover:opacity-100" />
                            </div>
                          ) : (
                            <div className="flex-1 border-2 border-dashed border-slate-100 rounded-lg min-h-[120px] opacity-50"></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </main>

          <div className="bg-slate-100 border-t border-slate-300 p-4 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-10 relative">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 gap-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Inbox className="w-4 h-4 text-[#e04616]" />
                Production Queue (Unscheduled Jobs)
                <span className="text-xs font-normal text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {unscheduledOrders.length} items
                </span>
              </h2>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {userRole !== "VMI" && (
                  <button
                    onClick={() => fileInputRef.current.click()}
                    className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-md border border-slate-700 transition-colors shadow-sm font-semibold"
                  >
                    <UploadCloud className="w-3.5 h-3.5" /> Import CSV
                  </button>
                )}

                {userRole !== "VMI" && (
                  <button
                    onClick={() =>
                      handleOpenModal("Unscheduled", "Unscheduled")
                    }
                    className="flex items-center gap-1.5 text-xs bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-md border border-slate-300 transition-colors shadow-sm font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#e04616]" /> Add Plan
                  </button>
                )}

                {unscheduledOrders.length > 0 && userRole !== "VMI" && (
                  <button
                    onClick={handleDeleteAllUnscheduled}
                    className="flex items-center gap-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-md border border-red-200 transition-colors font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete All
                  </button>
                )}

                {selectedWos.length > 0 && userRole !== "VMI" && (
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md border border-red-700 transition-colors font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Selected (
                    {selectedWos.length})
                  </button>
                )}
              </div>
            </div>

            <div
              className="flex gap-4 overflow-x-auto pb-2 min-h-[160px] bg-slate-200/50 p-4 rounded-xl border-2 border-dashed border-slate-300 items-start"
              onDragOver={handleDragOver}
              onDrop={(e) => {
                if (userRole !== "VMI")
                  handleDrop(e, "Unscheduled", "Unscheduled");
              }}
            >
              {unscheduledOrders.length > 0 ? (
                unscheduledOrders.map((wo) => renderWorkOrderCard(wo, true))
              ) : (
                <div className="m-auto text-slate-400 text-sm italic flex flex-col items-center">
                  <span>Tray is empty.</span>
                  {userRole !== "VMI" && (
                    <span>
                      Upload a CSV file or drag blocks back here to unschedule
                      them.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ========================================= */}
      {/* HISTORY VIEW               */}
      {/* ========================================= */}
      {activeView === "history" && (
        <main className="p-4 sm:p-6 overflow-y-auto flex-1">
          <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[500px]">
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" /> Production
                  History Log
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Record of completed jobs to help identify previous routing
                  cells.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Model or WO..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-[#e04616] focus:border-[#e04616] outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold">Date</th>
                    <th className="p-4 font-semibold text-[#e04616]">
                      Production Cell
                    </th>
                    <th className="p-4 font-semibold">Model Name</th>
                    <th className="p-4 font-semibold">Work Order</th>
                    <th className="p-4 font-semibold text-right">Plan Qty</th>
                    <th className="p-4 font-semibold text-right">Actual Out</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((wo) => (
                      <tr
                        key={wo.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-800 border border-green-200">
                            <CheckCircle className="w-3 h-3" /> Completed
                          </span>
                        </td>
                        <td className="p-4 font-medium text-slate-600 whitespace-nowrap">
                          {formatDateShort(wo.completedAt || wo.targetDate)}
                        </td>
                        <td className="p-4 font-bold text-slate-800">
                          {wo.cell !== "Unscheduled" ? (
                            wo.cell
                          ) : (
                            <span className="text-slate-400 font-normal italic">
                              N/A
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-bold text-slate-800">
                          {wo.modelName}
                        </td>
                        <td className="p-4 text-slate-500 font-mono text-xs">
                          {wo.woNumber}
                        </td>
                        <td className="p-4 text-right text-slate-600">
                          {wo.qtyPlanned}
                        </td>
                        <td className="p-4 text-right font-bold text-green-700">
                          {wo.qtyOut}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="7"
                        className="p-12 text-center text-slate-500"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <History className="w-12 h-12 text-slate-300 mb-3" />
                          <p className="text-lg font-medium text-slate-600">
                            No completed records found
                          </p>
                          <p className="text-sm">
                            {historySearch
                              ? "Try adjusting your search terms."
                              : "Jobs will appear here once Actual Output meets Planned Quantity."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 border-t border-slate-200 p-4 text-xs text-slate-500 text-right">
              Showing {filteredHistory.length} completed record(s)
            </div>
          </div>
        </main>
      )}

      {/* Edit/Add Modal - FIXED SCROLLING */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200 relative my-8">
              <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white sticky top-0 z-10">
                <h3 className="text-lg font-bold">
                  {editingWo
                    ? userRole === "VMI"
                      ? "Inspect Actuals"
                      : "Update Production Status"
                    : "Schedule Work Order"}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Cell
                    </label>
                    <select
                      disabled={isPlanDisabled}
                      className={inputClass(isPlanDisabled)}
                      value={formData.cell}
                      onChange={(e) =>
                        setFormData({ ...formData, cell: e.target.value })
                      }
                    >
                      <option value="Unscheduled">-- Unscheduled --</option>
                      {CELLS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Day
                    </label>
                    <select
                      disabled={isPlanDisabled}
                      className={inputClass(isPlanDisabled)}
                      value={formData.day}
                      onChange={(e) => {
                        const newDay = e.target.value;
                        setFormData((prev) => {
                          const nextState = { ...prev, day: newDay };
                          const newStatus = calculateStatus(nextState, newDay);
                          if (
                            newStatus === "completed" &&
                            prev.status !== "completed"
                          ) {
                            nextState.completedAt = new Date().toISOString();
                          }
                          nextState.status = newStatus;
                          return nextState;
                        });
                      }}
                    >
                      <option value="Unscheduled">-- Unscheduled --</option>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div
                  className={`bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 space-y-4 ${
                    isPlanDisabled ? "opacity-80" : ""
                  }`}
                >
                  <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 flex justify-between">
                    <span>
                      Production Plan {isPlanDisabled && "(Read Only)"}
                    </span>
                    {isPlanDisabled && (
                      <span className="text-xs text-slate-500 font-normal">
                        Prepare Team Only
                      </span>
                    )}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Work Order (WO)
                      </label>
                      <input
                        required={!isPlanDisabled}
                        disabled={isPlanDisabled}
                        type="text"
                        className={inputClass(isPlanDisabled)}
                        placeholder="e.g. WO-10294"
                        value={formData.woNumber}
                        onChange={(e) =>
                          setFormData({ ...formData, woNumber: e.target.value })
                        }
                        autoFocus={!editingWo && !isPlanDisabled}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Model Name
                      </label>
                      <input
                        required={!isPlanDisabled}
                        disabled={isPlanDisabled}
                        type="text"
                        className={inputClass(isPlanDisabled)}
                        placeholder="e.g. PCB-MAIN"
                        value={formData.modelName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            modelName: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Target Date
                      </label>
                      <input
                        required={!isPlanDisabled}
                        disabled={isPlanDisabled}
                        type="date"
                        className={inputClass(isPlanDisabled)}
                        value={formData.targetDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            targetDate: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex justify-between items-center">
                        <span>Customer Deadline</span>
                        {formData.targetDate > formData.deadline && (
                          <span className="text-red-500 flex items-center normal-case">
                            <AlertTriangle className="w-3 h-3 mr-1" /> Exceeded
                          </span>
                        )}
                      </label>
                      <input
                        required={!isPlanDisabled}
                        disabled={isPlanDisabled}
                        type="date"
                        className={`${inputClass(isPlanDisabled)} ${
                          formData.targetDate > formData.deadline
                            ? "border-red-500 ring-red-200 focus:ring-red-500"
                            : ""
                        }`}
                        value={formData.deadline}
                        onChange={(e) =>
                          setFormData({ ...formData, deadline: e.target.value })
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Planned Quantity
                      </label>
                      <input
                        required={!isPlanDisabled}
                        disabled={isPlanDisabled}
                        type="number"
                        min="0"
                        className={inputClass(isPlanDisabled)}
                        value={formData.qtyPlanned}
                        onChange={(e) => {
                          const val =
                            e.target.value === ""
                              ? ""
                              : parseInt(e.target.value, 10);
                          setFormData((prev) => {
                            const nextState = { ...prev, qtyPlanned: val };
                            const newStatus = calculateStatus(
                              { ...nextState, qtyPlanned: val || 0 },
                              prev.day
                            );
                            if (
                              newStatus === "completed" &&
                              prev.status !== "completed"
                            ) {
                              nextState.completedAt = new Date().toISOString();
                            }
                            nextState.status = newStatus;
                            return nextState;
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className={`bg-[#e04616]/5 p-4 rounded-lg border border-[#e04616]/20 mb-6 space-y-4 ${
                    isActualDisabled ? "opacity-80" : ""
                  }`}
                >
                  <div className="flex justify-between items-center border-b border-[#e04616]/20 pb-2">
                    <h4 className="text-sm font-bold text-[#e04616] flex items-center gap-2">
                      Actual Production{" "}
                      {isActualDisabled && (
                        <span className="text-xs text-[#e04616]/70 font-normal">
                          (Read Only)
                        </span>
                      )}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#e04616]/70 font-normal hidden sm:block">
                        {isActualDisabled
                          ? "VMI Team Only"
                          : "(Auto-calculated)"}
                      </span>
                      <select
                        disabled={isActualDisabled}
                        title="Status is calculated automatically based on Day and Quantity"
                        className={`text-xs font-bold uppercase rounded-full px-3 py-1 border outline-none ${
                          isActualDisabled
                            ? "cursor-not-allowed opacity-70"
                            : "cursor-pointer"
                        } ${getStatusColor(formData.status)}`}
                        value={formData.status}
                        onChange={(e) => {
                          const newStatus = e.target.value;
                          setFormData((prev) => {
                            const nextState = { ...prev, status: newStatus };
                            if (
                              newStatus === "completed" &&
                              prev.status !== "completed"
                            ) {
                              nextState.completedAt = new Date().toISOString();
                            }
                            return nextState;
                          });
                        }}
                      >
                        <option value="queued">Queued</option>
                        <option value="running">Running</option>
                        <option value="delayed">Delayed</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#e04616] uppercase mb-1">
                        Quantity Input
                      </label>
                      <input
                        disabled={isActualDisabled}
                        type="number"
                        min="0"
                        className={inputClass(isActualDisabled)}
                        value={formData.qtyIn}
                        onChange={(e) => {
                          const val =
                            e.target.value === ""
                              ? ""
                              : parseInt(e.target.value, 10);
                          setFormData({ ...formData, qtyIn: val });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#e04616] uppercase mb-1">
                        Quantity Output
                      </label>
                      <input
                        disabled={isActualDisabled}
                        type="number"
                        min="0"
                        className={inputClass(isActualDisabled)}
                        value={formData.qtyOut}
                        onChange={(e) => {
                          const val =
                            e.target.value === ""
                              ? ""
                              : parseInt(e.target.value, 10);
                          setFormData((prev) => {
                            const nextState = { ...prev, qtyOut: val };
                            const newStatus = calculateStatus(
                              { ...nextState, qtyOut: val || 0 },
                              prev.day
                            );
                            if (
                              newStatus === "completed" &&
                              prev.status !== "completed"
                            ) {
                              nextState.completedAt = new Date().toISOString();
                            }
                            nextState.status = newStatus;
                            return nextState;
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-200">
                  {editingWo && !isPlanDisabled ? (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="w-full sm:w-auto text-red-600 text-sm font-semibold hover:text-red-800 hover:bg-red-50 rounded-md px-4 py-2 transition-colors"
                    >
                      Delete Order
                    </button>
                  ) : (
                    <div className="hidden sm:block"></div>
                  )}
                  <div className="flex w-full sm:w-auto gap-3">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition-colors text-center border border-slate-300 sm:border-transparent"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold bg-[#e04616] text-white rounded-md hover:bg-[#c43a10] transition-colors shadow-sm text-center"
                    >
                      {editingWo ? "Save Updates" : "Add Work Order"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
