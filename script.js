import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, setDoc, getDocs, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase 連線設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyBEnhhC0jwY-SGJyv7MakB7IKE--mpBJ4c",
  authDomain: "glowu-97c37.firebaseapp.com",
  projectId: "glowu-97c37",
  storageBucket: "glowu-97c37.firebasestorage.app",
  messagingSenderId: "433418002202",
  appId: "1:433418002202:web:d87b8c92b3c922649fd6a3",
  measurementId: "G-N19Q5J2DPX"
};

const appId = "uncle-baby-tracker"; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 全域狀態管理 ---
const state = {
  user: null,
  identity: localStorage.getItem('task_app_identity') || null,
  tasks: [],
  calendarRecords: {},
  bankRecords: [],
  mottoData: { text: '「慢慢起步，我們會達到曾經難以想像的高度！」', editCount: 0, monthKey: '' },
  activeTab: 'mine', 
  viewDate: new Date(),
  isInitialized: false
};

const prevProgressState = new Map();

const getLogicDateString = () => {
  const now = new Date();
  if (now.getHours() < 5) now.setDate(now.getDate() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getLogicWeekString = () => {
  const now = new Date();
  if (now.getHours() < 5) now.setDate(now.getDate() - 1);
  const date = new Date(now.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNumber = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${date.getFullYear()}-W${weekNumber}`;
};

const isTaskWeekly = (t) => t.isWeekly === true || (typeof t.text === 'string' && t.text.includes('每週'));
const getTaskOrder = (t) => (t && t.order !== undefined && t.order !== null) ? t.order : 100;

// --- 預設任務庫 ---
const DEFAULT_BABY_TASKS = [
  { type: 'progress', text: '每日喝水目標', targetValue: 1000, currentValue: 0, unit: 'ml', owner: '寶寶', note: '多喝水皮膚好！', order: 1, isDefault: true },
  { type: 'simple', text: '讀半小時書', completed: false, owner: '寶寶', note: '', order: 2, isDefault: true },
  { type: 'checklist', text: '培養多語言力', checklistItems: [{ id: 'c1', label: 'Speak 15分鐘⬆️', isChecked: false }, { id: 'c2', label: 'Materials for 15 mins', isChecked: false }, { id: 'c_duo', label: '今天Duo了嗎', isChecked: false }, { id: 'c_typing', label: '練一塊英打', isChecked: false }], targetCount: 2, completed: false, owner: '寶寶', note: '完成其中兩項即可', order: 3, isDefault: true },
  { type: 'simple', text: '回答問題', completed: false, owner: '寶寶', note: '每日省思', order: 4, isDefault: true },
  { type: 'simple', text: '放鬆', completed: false, owner: '寶寶', note: '給自己一點時間喘口氣', order: 5, isDefault: true },
  { type: 'simple', text: '24點前必須躺在床上', completed: false, owner: '寶寶', note: '美容覺很重要', order: 6, isDefault: true }
];

const DEFAULT_UNCLE_TASKS = [
  { type: 'checklist', text: '每週打牌牌五天', checklistItems: [{ id: 'mon', label: '週一', isChecked: false }, { id: 'tue', label: '週二', isChecked: false }, { id: 'wed', label: '週三', isChecked: false }, { id: 'thu', label: '週四', isChecked: false }, { id: 'fri', label: '週五', isChecked: false }, { id: 'sat', label: '週六', isChecked: false }, { id: 'sun', label: '週日', isChecked: false }], targetCount: 5, completed: false, owner: '大叔', note: '本週累積戰績', order: 0, isDefault: true, isWeekly: true },
  { type: 'simple', text: '喝水1000毫升以上', completed: false, owner: '大叔', note: '基本代謝', order: 2, isDefault: true },
  { type: 'simple', text: '冥想12分鐘', completed: false, owner: '大叔', note: '靜心才怪，寶包要佔據叔餅腦袋！', order: 3, isDefault: true },
  { type: 'simple', text: '閱讀20分鐘(含一章節開運)', completed: false, owner: '大叔', note: '開卷有益', order: 4, isDefault: true },
  { type: 'simple', text: '學習德州知識15~20分鐘', completed: false, owner: '大叔', note: '持續精進', order: 5, isDefault: true },
  { type: 'simple', text: '放鬆&伸展7~10分鐘', completed: false, owner: '大叔', note: '舒緩肌肉', order: 6, isDefault: true },
  { type: 'checklist', text: '體能鍛鍊 (6擇4)', checklistItems: [{ id: 'ex1', label: '伏地挺身36下', isChecked: false }, { id: 'ex2', label: '舉啞鈴45下', isChecked: false }, { id: 'ex3', label: '臀橋45下', isChecked: false }, { id: 'ex4', label: '平板支撐1分鐘', isChecked: false }, { id: 'ex5', label: '踮腳尖60下', isChecked: false }, { id: 'ex6', label: '仰臥起坐45下', isChecked: false }, { id: 'yoga', label: '瑜珈一小時', isChecked: false }], targetCount: 4, completed: false, owner: '大叔', note: '腿腿有力，寶包有利', order: 7, isDefault: true },
  { type: 'choice', text: '步步高升', choices: [{ id: 'c1', label: '走路7000步' }, { id: 'c2', label: '滾筒20分(一週一次)' }, { id: 'c3', label: '使用打ㄆ特權！' }], selectedChoiceId: null, completed: false, owner: '大叔', note: '擇一即可完成', order: 8, isDefault: true },
  { type: 'choice', text: '今日作息狀況', choices: [{ id: 'c1', label: '12:30睡' }, { id: 'c2', label: '打牌特權：到家2小時候睡' }], selectedChoiceId: null, completed: false, owner: '大叔', note: '早睡早起身體好', order: 9, isDefault: true },
  { type: 'simple', text: '抱可愛迷人的寶包睡覺覺🥵', completed: false, owner: '大叔', note: '每晚最重要的事情', order: 10, isDefault: true }
];

// --- 初始化與連線監聽 ---
    const initApp = async () => {
      onAuthStateChanged(auth, (user) => {
        state.user = user;
        if (user) {
          // 如果有登入 Google，才開始載入資料
          if (!state.isInitialized) {
            state.isInitialized = true;
            setupListeners();
            checkAndInjectDefaults();
          }
        } else {
          // 如果沒登入，清空初始化狀態
          state.isInitialized = false; 
        }
        scheduleRender();
      });
    };

let unsubTasks, unsubRecords, unsubBank, unsubConfig;
const setupListeners = () => {
  if(unsubTasks) unsubTasks();
  if(unsubRecords) unsubRecords();
  if(unsubBank) unsubBank();
  if(unsubConfig) unsubConfig();

  unsubTasks = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks'), async (snapshot) => {
    try {
      let loadedTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const todayLogicDate = getLogicDateString();
      const currentWeekString = getLogicWeekString(); 
      const batch = writeBatch(db);
      let needsBatchCommit = false;

      loadedTasks.forEach(t => {
        if (isTaskWeekly(t)) {
            if (!t.isWeekly) { batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', t.id), { isWeekly: true, type: 'checklist' }); needsBatchCommit = true; }
            if (t.lastUpdatedWeek !== currentWeekString) {
                let resetData = { lastUpdatedWeek: currentWeekString, lastUpdatedDate: todayLogicDate, completed: false, remedyTargetDate: null, remedyCompleted: false };
                if (t.type === 'progress') resetData.currentValue = 0;
                else if (t.type === 'checklist') resetData.checklistItems = t.checklistItems?.map(i => ({...i, isChecked: false})) || [];
                batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', t.id), resetData);
                needsBatchCommit = true;
                t.completed = false; t.remedyTargetDate = null; t.remedyCompleted = false; t.currentValue = 0; if (t.checklistItems) t.checklistItems.forEach(i => i.isChecked = false);
            }
        } else {
            if (t.lastUpdatedDate !== todayLogicDate) {
              let resetData = { lastUpdatedDate: todayLogicDate, completed: false, remedyTargetDate: null, remedyCompleted: false };
              if (t.type === 'progress') resetData.currentValue = 0;
              else if (t.type === 'choice') resetData.selectedChoiceId = null;
              else if (t.type === 'checklist') resetData.checklistItems = t.checklistItems?.map(i => ({...i, isChecked: false})) || [];
              batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', t.id), resetData);
              needsBatchCommit = true;
              t.completed = false; t.remedyTargetDate = null; t.remedyCompleted = false; t.currentValue = 0; t.selectedChoiceId = null; if (t.checklistItems) t.checklistItems.forEach(i => i.isChecked = false); t.lastUpdatedDate = todayLogicDate;
            }
        }
      });
      
      const uncleYogaDone = loadedTasks.some(t => t.owner === '大叔' && t.type === 'checklist' && t.checklistItems?.some(i => (i.id === 'yoga' || i.label.includes('瑜珈')) && i.isChecked));
      if (uncleYogaDone) {
        const relaxTask = loadedTasks.find(t => t.owner === '大叔' && t.text.includes('放鬆&伸展') && !t.completed);
        if (relaxTask) {
           batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', relaxTask.id), { completed: true });
           needsBatchCommit = true;
        }
      }

      try { if (needsBatchCommit) await batch.commit(); } catch (err) {}

      let visibleTasks = loadedTasks.filter(t => !t.isHidden);
      state.tasks = visibleTasks.sort((a, b) => getTaskOrder(a) - getTaskOrder(b));
      
      updateDailyRecords();
      scheduleRender();
    } catch (error) { console.error("任務載入錯誤:", error); }
  }, (err) => {
      console.error("Task Snapshot Error", err);
      if(err.code === 'permission-denied') {
          window.showAlert("資料庫權限不足！請確認 Firebase Firestore 的規則已設定為允許讀寫。");
      }
  });

  unsubRecords = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'challenge_records'), (snapshot) => {
    state.calendarRecords = {};
    snapshot.docs.forEach(d => { state.calendarRecords[d.id] = d.data(); });
    scheduleRender();
  }, (err) => console.error(err));

  unsubBank = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'challenge_bank_records'), (snapshot) => {
    state.bankRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.createdAt - a.createdAt);
    scheduleRender();
  }, (err) => console.error(err));

  unsubConfig = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'app_settings', 'config'), (docSnap) => {
    if (docSnap.exists() && docSnap.data().motto) {
       state.mottoData = typeof docSnap.data().motto === 'string' ? { text: docSnap.data().motto, editCount: 0, monthKey: '' } : docSnap.data().motto;
       scheduleRender();
    }
  }, (err) => console.error(err));
};

const checkAndInjectDefaults = async () => {
  try {
    const tasksRef = collection(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks');
    const snapshot = await getDocs(tasksRef);
    const allDocs = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
    const todayStr = getLogicDateString();

    const babyTasks = allDocs.filter(t => t.owner === '寶寶' && !t.isHidden);
    for (const task of DEFAULT_BABY_TASKS) {
       if (!babyTasks.some(t => (t.originalText || t.text) === task.text)) {
          await addDoc(tasksRef, { ...task, createdAt: Date.now(), createdByUid: state.user.uid, lastUpdatedDate: todayStr });
       }
    }
    
    const babyWaterTask = babyTasks.find(t => t.text === '每日喝水目標');
    if (babyWaterTask && babyWaterTask.targetValue === 2000) {
       await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', babyWaterTask.id), { targetValue: 1000, completed: babyWaterTask.currentValue >= 1000 ? true : babyWaterTask.completed });
    }

    const uncleTasks = allDocs.filter(t => t.owner === '大叔' && !t.isHidden);
    for (const task of DEFAULT_UNCLE_TASKS) {
       if (!uncleTasks.some(t => (t.originalText || t.text) === task.text)) {
          await addDoc(tasksRef, { ...task, createdAt: Date.now(), createdByUid: state.user.uid, lastUpdatedDate: todayStr });
       }
    }
    
    const stepUpTask = uncleTasks.find(t => t.text === '步步高升');
    if (stepUpTask && stepUpTask.choices && stepUpTask.choices.length === 2) {
       const newChoices = [...stepUpTask.choices, { id: 'c3', label: '使用打ㄆ特權！' }];
       await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', stepUpTask.id), { choices: newChoices, note: '擇一即可完成' });
    }
  } catch (err) { console.error("預設任務檢查失敗:", err); }
};

const updateDailyRecords = async () => {
        if (!state.user || state.tasks.length === 0) return;
        const todayStr = getLogicDateString();
        
        // 配合凌晨 5 點換日，確保「週一凌晨」依然算是「邏輯週日」的結算範圍
        const now = new Date();
        if (now.getHours() < 5) now.setDate(now.getDate() - 1);
        const isSunday = now.getDay() === 0;

    const babyTasks = state.tasks.filter(t => t.owner === '寶寶' && !t.isHidden);
    const uncleTasks = state.tasks.filter(t => t.owner === '大叔' && !t.isHidden);
    if (babyTasks.length === 0 && uncleTasks.length === 0) return;

    const calcBabyTasks = babyTasks.filter(t => isSunday || !isTaskWeekly(t));
    const calcUncleTasks = uncleTasks.filter(t => isSunday || !isTaskWeekly(t));

    const babyCompleted = calcBabyTasks.length > 0 && calcBabyTasks.every(t => t.completed);
    const uncleCompleted = calcUncleTasks.length > 0 && calcUncleTasks.every(t => t.completed);

    const babyMissed = calcBabyTasks.filter(t => !t.completed).map(t => String(t.text || "未命名任務"));
    const uncleMissed = calcUncleTasks.filter(t => !t.completed).map(t => String(t.text || "未命名任務"));

    const currentRecord = state.calendarRecords[todayStr] || {};
    const babyMissedChanged = JSON.stringify(currentRecord.babyDetails?.missed) !== JSON.stringify(babyMissed);
    const uncleMissedChanged = JSON.stringify(currentRecord.uncleDetails?.missed) !== JSON.stringify(uncleMissed);

    if (currentRecord.baby !== !!babyCompleted || currentRecord.uncle !== !!uncleCompleted || babyMissedChanged || uncleMissedChanged) {
       await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_records', todayStr), {
         baby: !!babyCompleted, uncle: !!uncleCompleted,
         babyDetails: { total: calcBabyTasks.length, done: calcBabyTasks.length - babyMissed.length, missed: babyMissed },
         uncleDetails: { total: calcUncleTasks.length, done: calcUncleTasks.length - uncleMissed.length, missed: uncleMissed }
       }, { merge: true });
    }
};

// --- 客製化 Modal (升級版：支援右上角叉叉與點擊背景關閉) ---
    // 1. 系統提示 Modal
    window.showAlert = (message) => {
        const html = `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E342E]/40 backdrop-blur-sm fade-in" onclick="if(event.target === this) document.getElementById('modals').innerHTML=''">
                <div class="bg-[#FDF8F3] rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#D7CCC8] p-6 relative slide-up text-center">
                    <button data-action="close-modal" class="absolute top-4 right-4 p-2 bg-[#EFEBE9] rounded-full text-[#8D6E63] hover:bg-[#D7CCC8] transition-colors">
                        <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                    <p class="text-[#5D4037] font-bold mt-4 mb-6">${message}</p>
                    <button data-action="close-modal" class="w-full py-3 bg-[#5D4037] text-white rounded-xl font-bold text-sm hover:bg-[#3E2723] transition-colors">確定</button>
                </div>
            </div>
        `;
        document.getElementById('modals').innerHTML = html;
        lucide.createIcons();
    };

    // 2. 確認視窗 Modal
    window.showConfirm = (message, onConfirm) => {
        window._confirmCallback = onConfirm;
        const html = `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E342E]/40 backdrop-blur-sm fade-in" onclick="if(event.target === this) document.getElementById('modals').innerHTML=''">
                <div class="bg-[#FDF8F3] rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#D7CCC8] p-6 relative slide-up text-center">
                    <button data-action="close-modal" class="absolute top-4 right-4 p-2 bg-[#EFEBE9] rounded-full text-[#8D6E63] hover:bg-[#D7CCC8] transition-colors">
                        <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                    <p class="text-[#5D4037] font-bold mt-4 mb-6 whitespace-pre-line">${message}</p>
                    <div class="flex gap-3">
                        <button data-action="close-modal" class="flex-1 py-3 bg-[#EFEBE9] text-[#8D6E63] rounded-xl font-bold text-sm hover:bg-[#D7CCC8] transition-colors">取消</button>
                        <button onclick="document.getElementById('modals').innerHTML=''; window._confirmCallback()" class="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 transition-colors">確定</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('modals').innerHTML = html;
        lucide.createIcons();
    };


const renderLogin = () => {
      // 步驟一：如果還沒登入 Google，顯示 Google 登入按鈕
      if (!state.user) {
        return `
          <div class="flex flex-col items-center justify-center p-6 relative overflow-hidden min-h-screen fade-in">
            <div class="absolute top-[-50px] right-[-50px] w-40 h-40 bg-[#D7CCC8] rounded-full opacity-50 blur-2xl"></div>
            <div class="absolute bottom-[-20px] left-[-20px] w-60 h-60 bg-[#EFEBE9] rounded-full opacity-30 blur-3xl"></div>
            <div class="z-10 w-full max-w-md text-center">
              <div class="mb-8 inline-flex items-center justify-center p-4 bg-white rounded-full shadow-sm border border-[#EFEBE9]">
                <i data-lucide="lock" class="w-8 h-8 text-[#5D4037]"></i>
              </div>
              <h1 class="text-xl sm:text-2xl md:text-3xl font-bold text-[#3E2723] mb-4 tracking-wide">專屬空間登入</h1>
              <p class="text-[#8D6E63] mb-12">請先使用 Google 帳號驗證身分嗷嗷</p>
              <button data-action="google-login" class="w-full py-4 bg-white border border-[#D7CCC8] hover:border-[#8D6E63] rounded-2xl flex items-center justify-center gap-3 transition-all shadow-sm hover:shadow-md font-bold text-[#5D4037]">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-6 h-6" alt="Google">
                使用 Google 帳號登入
              </button>
            </div>
          </div>
        `;
      }
      
      // 步驟二：登入了 Google，但還沒選擇身分，顯示身分選單
      return `
        <div class="flex flex-col items-center justify-center p-6 relative overflow-hidden min-h-screen fade-in">
          <div class="absolute top-[-50px] right-[-50px] w-40 h-40 bg-[#D7CCC8] rounded-full opacity-50 blur-2xl"></div>
          <div class="absolute bottom-[-20px] left-[-20px] w-60 h-60 bg-[#EFEBE9] rounded-full opacity-30 blur-3xl"></div>
          <div class="z-10 w-full max-w-md text-center">
            <div class="mb-8 inline-flex items-center justify-center p-4 bg-white rounded-full shadow-sm border border-[#EFEBE9]">
              <i data-lucide="heart" class="w-8 h-8 text-[#5D4037] animate-pulse fill-[#5D4037]"></i>
            </div>
            <h1 class="text-xl sm:text-2xl md:text-3xl font-bold text-[#3E2723] mb-2 tracking-wide whitespace-nowrap">${new Date().getFullYear()} ${new Date().getMonth() + 1}月 每日目標挑戰</h1>
            <p class="text-[#8D6E63] mb-12">一起成長嗷嗷嗷</p>
            <div class="flex gap-4 justify-center w-full px-2">
              <button data-action="set-identity" data-id="寶寶" class="flex-1 aspect-[3/4] bg-white hover:bg-[#EFEBE9] border-2 border-[#D7CCC8] hover:border-[#8D6E63] rounded-2xl flex flex-col items-center justify-center p-4 transition-all shadow-sm hover:shadow-lg hover:-translate-y-1 group relative">
                <div class="w-16 h-16 bg-[#D7CCC8] rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-inner"><i data-lucide="sparkles" class="text-[#5D4037] w-8 h-8"></i></div>
                <div class="text-center"><h3 class="text-lg font-bold text-[#4E342E] mb-2">我是寶寶</h3><p class="text-xs text-[#8D6E63] leading-relaxed">可愛擔當<br/>認真生活</p></div>
              </button>
              <button data-action="set-identity" data-id="大叔" class="flex-1 aspect-[3/4] bg-white hover:bg-[#EFEBE9] border-2 border-[#D7CCC8] hover:border-[#8D6E63] rounded-2xl flex flex-col items-center justify-center p-4 transition-all shadow-sm hover:shadow-lg hover:-translate-y-1 group relative">
                <div class="w-16 h-16 bg-[#BCAAA4] rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-inner"><i data-lucide="heart" class="text-[#3E2723] fill-[#3E2723] w-8 h-8"></i></div>
                <div class="text-center"><h3 class="text-lg font-bold text-[#4E342E] mb-2">我是大叔</h3><p class="text-xs text-[#8D6E63] leading-relaxed">穩重擔當<br/>努力工作</p></div>
              </button>
            </div>
          </div>
        </div>
      `;
    };

const renderDashboard = () => {
  const partnerName = state.identity === '寶寶' ? '大叔' : '寶寶';
  
  const myTasks = state.tasks.filter(t => t.owner === state.identity && !t.isHidden);
  const partnerTasks = state.tasks.filter(t => t.owner === partnerName && !t.isHidden);
  
  const getProgress = (taskList) => { 
        // 配合凌晨 5 點換日，確保「週一凌晨」依然算是「邏輯週日」的結算範圍
        const now = new Date();
        if (now.getHours() < 5) now.setDate(now.getDate() - 1);
        const isSunday = now.getDay() === 0;
        
        const calcTasks = taskList.filter(t => isSunday || !isTaskWeekly(t));
        return { total: calcTasks.length, done: calcTasks.filter(t => t.completed).length }; 
      };
  const myProgress = getProgress(myTasks);
  const partnerProgress = getProgress(partnerTasks);

  const displayedTasks = state.activeTab === 'mine' ? myTasks : partnerTasks;
  const weeklyTasks = displayedTasks.filter(t => isTaskWeekly(t));
  const dailyTasks = displayedTasks.filter(t => !isTaskWeekly(t));

  return `
    <div class="max-w-xl mx-auto w-full">
      <div class="bg-white rounded-b-[40px] shadow-sm px-6 pt-12 pb-8 mb-6 border-b border-[#EFEBE9]">
        <div class="flex justify-between items-center mb-6">
          <div class="max-w-[85%]">
            <h2 class="text-xl font-bold text-[#3E2723] flex flex-wrap items-center gap-2 leading-tight">
              早安，${state.identity === '寶寶' ? 'Sexy with Brain的寶包' : '會賺大錢錢給寶包花的大叔'} 
              <i data-lucide="${state.identity === '寶寶' ? 'sparkles' : 'heart'}" class="w-6 h-6 ${state.identity === '大叔' ? 'text-[#5D4037] fill-[#5D4037]' : 'text-[#8D6E63]'}"></i>
            </h2>
            <div class="mt-1 flex items-center gap-2 group relative cursor-pointer" data-action="edit-motto">
              <p class="text-xs text-[#A1887F] break-words">${state.mottoData.text}</p>
              <i data-lucide="pen-line" class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#D7CCC8] hover:text-[#8D6E63]"></i>
            </div>
          </div>
          <button data-action="logout" class="p-2 bg-[#EFEBE9] rounded-full text-[#8D6E63] hover:bg-[#D7CCC8]">
            <i data-lucide="log-out" class="w-4 h-4"></i>
          </button>
        </div>
        <div class="space-y-1">
          ${renderProgressBar(state.identity === '寶寶' ? "寶寶的進度" : "大叔的進度", myProgress.total, myProgress.done, state.identity === '寶寶' ? "bg-[#8D6E63]" : "bg-[#5D4037]", state.identity === '寶寶' ? "sparkles" : "heart")}
          ${renderProgressBar(state.identity === '寶寶' ? "大叔的進度" : "寶寶的進度", partnerProgress.total, partnerProgress.done, state.identity === '寶寶' ? "bg-[#D7CCC8]" : "bg-[#BCAAA4]", state.identity === '寶寶' ? "heart" : "sparkles")}
        </div>
      </div>

      <div class="px-5">
        ${renderCalendarHtml()}

        <div class="flex gap-4 mb-6">
          <button data-action="set-tab" data-tab="mine" class="flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${state.activeTab === 'mine' ? 'bg-[#5D4037] text-[#FDF8F3] shadow-md' : 'text-[#A1887F] hover:bg-white'}">我的任務</button>
          <button data-action="set-tab" data-tab="partner" class="flex-1 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${state.activeTab === 'partner' ? 'bg-[#5D4037] text-[#FDF8F3] shadow-md' : 'text-[#A1887F] hover:bg-white'}">偷看${partnerName} ${state.activeTab === 'partner' ? '<i data-lucide="sparkles" class="w-3.5 h-3.5"></i>' : ''}</button>
          <button data-action="set-tab" data-tab="bank" class="flex-1 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${state.activeTab === 'bank' ? 'bg-[#5D4037] text-[#FDF8F3] shadow-md' : 'text-[#A1887F] hover:bg-white'}">叔寶銀行 <i data-lucide="landmark" class="w-3.5 h-3.5"></i></button>
        </div>

        ${state.activeTab === 'bank' ? renderBankHtml() : `
          ${state.activeTab === 'mine' ? `
            <div class="mb-8 relative">
              <button data-action="open-add-task" class="w-full bg-white border-2 border-dashed border-[#D7CCC8] rounded-2xl py-4 pl-5 pr-14 shadow-sm text-[#A1887F] text-left hover:bg-[#FDF8F3] hover:border-[#8D6E63] transition-all flex items-center gap-2 group">
                <i data-lucide="plus" class="w-5 h-5 text-[#D7CCC8] group-hover:text-[#8D6E63]"></i><span>新增其他臨時任務...</span>
              </button>
            </div>
          ` : ''}

          ${weeklyTasks.length > 0 ? `
            <div class="mb-6">
               <div class="flex items-center gap-2 mb-3 text-[#5D4037] font-bold"><i data-lucide="calendar-days" class="w-[18px] h-[18px]"></i> <span>📅 本週挑戰</span></div>
               <div class="space-y-4">${weeklyTasks.map(t => renderTaskHtml(t, state.activeTab === 'mine')).join('')}</div>
            </div>
          ` : ''}
          
          <div class="mt-6">
             <div class="flex items-center gap-2 mb-3 text-[#5D4037] font-bold"><i data-lucide="sparkles" class="w-[18px] h-[18px]"></i> <span>☀️ 每日挑戰</span></div>
             <div class="space-y-4">
              ${dailyTasks.length > 0 ? dailyTasks.map(t => renderTaskHtml(t, state.activeTab === 'mine')).join('') : `
                  ${weeklyTasks.length > 0 ? `
                      <div class="text-center py-6 text-[#A1887F] text-sm bg-white rounded-2xl border border-dashed border-[#D7CCC8]">今日已無其他每日任務！</div>
                  ` : `
                      <div class="text-center py-12 text-[#A1887F]">
                        <div class="inline-block p-4 rounded-full bg-white mb-3"><i data-lucide="trophy" class="w-8 h-8 opacity-20 text-[#8D6E63]"></i></div>
                        <p class="mb-4">目前還沒有任務喔</p>
                        ${state.activeTab === 'mine' ? `<button data-action="reload-defaults" class="px-5 py-2.5 bg-white border border-[#D7CCC8] hover:border-[#8D6E63] text-[#5D4037] rounded-xl text-sm font-bold transition-all shadow-sm">重新載入預設任務</button>` : ''}
                      </div>
                  `}
              `}
            </div>
          </div>
        `}
      </div>
    </div>
    <div id="modals"></div>
  `;
};

const renderCalendarHtml = () => {
  const year = state.viewDate.getFullYear();
  const month = state.viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); 
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  
  let gridHtml = '';
  for (let i = 0; i < firstDayOfWeek; i++) gridHtml += `<div class="aspect-square"></div>`;
  
  const today = new Date();
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    const isSunday = d.getDay() === 0;
    const isLastDay = d.getDate() === daysInMonth;
    const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const record = state.calendarRecords[dateString] || {};
    
    gridHtml += `
      <div data-action="open-day-detail" data-date="${dateString}" class="aspect-square relative rounded-xl border transition-all overflow-hidden cursor-pointer active:scale-95 ${isToday ? 'bg-[#8D6E63] border-[#5D4037] text-white shadow-md' : 'bg-[#FFFCFA] border-[#F2EBE5] text-[#8D6E63] hover:bg-[#FDF8F3] hover:border-[#EFEBE9]'}">
        <span class="absolute top-1 left-1.5 text-[10px] font-bold leading-none z-10">${i}</span>
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 z-0">${isSunday ? '<span class="text-lg leading-none">🎁</span>' : ''}${isLastDay ? '<span class="text-lg leading-none">🎉</span>' : ''}</div>
        <div class="absolute inset-0 flex items-center justify-center pt-3 gap-0.5 z-20 pointer-events-none">${record.baby ? '<span class="text-sm leading-none drop-shadow-sm">💅</span>' : ''}${record.uncle ? '<span class="text-sm leading-none drop-shadow-sm">💋</span>' : ''}</div>
      </div>
    `;
  }

  return `
    <div class="bg-white rounded-3xl p-5 mb-6 border border-[#EFEBE9] shadow-sm">
      <div class="flex items-center justify-center gap-2 mb-4 text-[#8D6E63] text-sm font-bold bg-[#FDF8F3] p-3 rounded-xl border border-[#EFEBE9]"><span>⭐月度甜蜜集點卡</span></div>
      <div class="flex justify-between items-center mb-4 px-2">
        <button data-action="cal-prev" class="p-1 rounded-full text-[#8D6E63] hover:bg-[#FDF8F3]"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
        <h3 class="text-lg font-bold text-[#5D4037]">${year}年 ${monthNames[month]}</h3>
        <button data-action="cal-next" class="p-1 rounded-full text-[#8D6E63] hover:bg-[#FDF8F3]"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
      </div>
      <div class="grid grid-cols-7 gap-2 text-center mb-4">
        ${weekDays.map((d, i) => `<div class="text-xs font-bold py-1 ${i === 0 || i === 6 ? 'text-[#D7CCC8]' : 'text-[#A1887F]'}">${d}</div>`).join('')}
        ${gridHtml}
      </div>
      <div class="flex justify-center items-center gap-6 text-xs text-[#8D6E63] font-bold pt-2 border-t border-[#F2EBE5]"><div class="flex items-center gap-1"><span>💅</span><span>寶寶</span></div><div class="flex items-center gap-1"><span>💋</span><span>大叔</span></div></div>
    </div>
  `;
};

const renderBankHtml = () => {
  const uncleDebt = state.bankRecords.filter(r => r.who === '大叔' && r.type === 'money').reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const babyKisses = state.bankRecords.filter(r => r.who === '寶寶' && r.type === 'kiss').reduce((acc, curr) => acc + (curr.amount || 0), 0);
  
  let recordsHtml = state.bankRecords.length === 0 ? `<p class="text-center text-xs text-[#D7CCC8] py-4">目前沒有任何紀錄，表現很好喔！</p>` : state.bankRecords.map(r => {
    const isRedeem = r.amount < 0; const absAmount = Math.abs(r.amount);
    return `
      <div class="flex justify-between items-center p-3 rounded-xl border ${isRedeem ? 'bg-green-50 border-green-100' : 'bg-[#FDF8F3] border-[#EFEBE9]'}">
         <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs px-2 py-0.5 rounded-full font-bold ${r.who === '大叔' ? 'bg-stone-200 text-stone-600' : 'bg-pink-100 text-pink-600'}">${r.who}</span>
              <span class="text-sm font-bold ${isRedeem ? 'text-green-600' : 'text-[#5D4037]'}">${isRedeem ? (r.type === 'money' ? `償還 $${absAmount}` : `已親 ${absAmount} 下`) : (r.type === 'money' ? `罰款 $${absAmount}` : `累積 ${absAmount} 下`)}</span>
            </div>
            <p class="text-[10px] text-[#A1887F]">${r.date} ${r.note ? `• ${r.note}` : ''}</p>
         </div>
         <button data-action="delete-bank" data-id="${r.id}" class="text-[#D7CCC8] hover:text-red-400 p-2"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
      </div>
    `;
  }).join('');

  return `
    <div class="bg-white rounded-3xl p-6 mb-8 border border-[#EFEBE9] shadow-sm">
      <div class="flex items-center justify-center gap-2 mb-6"><i data-lucide="landmark" class="w-5 h-5 text-[#8D6E63]"></i><h2 class="text-lg font-bold text-[#5D4037]">叔寶銀行</h2></div>
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="bg-[#FFF8F0] p-4 rounded-2xl border border-[#FFE0B2] text-center"><p class="text-xs font-bold text-[#A1887F] mb-1">大叔累積罰金</p><p class="text-2xl font-black text-[#5D4037] flex items-center justify-center gap-1"><i data-lucide="coins" class="w-5 h-5 text-amber-500"></i> ${uncleDebt}</p></div>
        <div class="bg-[#FCE4EC] p-4 rounded-2xl border border-[#F8BBD0] text-center"><p class="text-xs font-bold text-[#A1887F] mb-1">寶寶累積親親</p><p class="text-2xl font-black text-[#880E4F] flex items-center justify-center gap-1"><i data-lucide="heart" class="w-5 h-5 text-pink-500 fill-pink-500"></i> ${babyKisses}</p></div>
      </div>
      <button data-action="open-add-bank" class="w-full py-3 bg-[#5D4037] text-[#FDF8F3] rounded-xl font-bold text-sm hover:bg-[#3E2723] transition-colors flex items-center justify-center gap-2 mb-6"><i data-lucide="plus" class="w-[18px] h-[18px]"></i> 管理銀行紀錄</button>
      <div class="space-y-3">
        <h3 class="text-xs font-bold text-[#8D6E63] flex items-center gap-1 mb-2"><i data-lucide="history" class="w-3.5 h-3.5"></i> 近期變動</h3>
        ${recordsHtml}
      </div>
    </div>
  `;
};

const renderTaskHtml = (task, isOwner) => {
  const isCompleted = task.completed;
  const getIcon = () => {
    const txt = String(task.text || '');
    if (txt.includes('英文') || txt.includes('書') || txt.includes('多語言')) return 'book-open';
    if (txt.includes('步步高升') || txt.includes('作息')) return 'list-todo';
    return 'list-todo';
  };

  let innerHtml = '';
  if (task.type === 'progress') {
    const percent = Math.min(100, Math.round(((task.currentValue || 0) / task.targetValue) * 100));
    const prevPerc = prevProgressState.get(task.id) ?? 0;
    prevProgressState.set(task.id, percent);

    innerHtml = `
      <div class="w-full mt-2">
        <div class="relative h-6 bg-[#EFEBE9] rounded-full overflow-hidden mb-3 border border-[#D7CCC8]">
          <div class="absolute inset-0 flex items-center justify-center z-10 text-xs font-bold text-[#5D4037] drop-shadow-sm">${task.currentValue || 0} / ${task.targetValue} ${task.unit} (${percent}%)</div>
          <div class="h-full bg-[#8D6E63] progress-animate" style="--start-w: ${prevPerc}%; --end-w: ${percent}%; width: ${percent}%"></div>
        </div>
        ${isOwner ? `
        <div class="flex flex-col gap-2 mt-2">
          <div class="flex gap-2 w-full">
            <button data-action="update-water" data-id="${task.id}" data-val="355" class="flex-1 py-2 bg-[#EFEBE9] text-[#5D4037] rounded-lg text-xs font-bold hover:bg-[#D7CCC8] border border-[#D7CCC8]">+355</button>
            <button data-action="update-water" data-id="${task.id}" data-val="480" class="flex-1 py-2 bg-[#EFEBE9] text-[#5D4037] rounded-lg text-xs font-bold hover:bg-[#D7CCC8] border border-[#D7CCC8]">+480</button>
          </div>
          <div class="flex gap-2 w-full items-center">
            <input type="number" id="custom-val-${task.id}" placeholder="自訂數值" class="flex-1 px-3 py-2 bg-white border border-[#D7CCC8] rounded-lg text-xs text-[#5D4037] focus:outline-none focus:border-[#8D6E63]">
            <button data-action="custom-update-water" data-id="${task.id}" data-sign="1" class="px-4 py-2 bg-[#EFEBE9] text-[#5D4037] border border-[#D7CCC8] rounded-lg text-xs font-bold hover:bg-[#D7CCC8] transition-colors">+</button>
            <button data-action="custom-update-water" data-id="${task.id}" data-sign="-1" class="px-4 py-2 bg-[#EFEBE9] text-[#5D4037] border border-[#D7CCC8] rounded-lg text-xs font-bold hover:bg-[#D7CCC8] transition-colors">-</button>
          </div>
        </div>` : ''}
      </div>
    `;
  } else if (task.type === 'choice') {
    innerHtml = `<div class="flex flex-col gap-2 w-full mt-2">
      ${(task.choices || []).map(c => `
        <div class="group/choiceitem w-full flex items-stretch rounded-xl border transition-all ${task.selectedChoiceId === c.id ? 'bg-[#5D4037] border-[#5D4037] text-[#FDF8F3] shadow-inner' : `bg-white border-[#EFEBE9] text-[#A1887F] ${isOwner ? 'hover:bg-[#EFEBE9]' : ''}`}">
          <button data-action="toggle-choice" data-id="${task.id}" data-cid="${c.id}" ${!isOwner ? 'disabled' : ''} class="flex-1 flex items-center justify-between px-4 py-3 text-left min-w-0 ${!isOwner ? 'cursor-default' : 'cursor-pointer'}">
            <span class="text-sm font-medium truncate pr-2">${c.label}</span>
            ${task.selectedChoiceId === c.id ? '<i data-lucide="check" class="w-4 h-4 flex-shrink-0 text-[#FDF8F3]"></i>' : ''}
          </button>
          ${isOwner ? `
          <div class="flex items-center pr-2">
            <button data-action="edit-choice-item" data-id="${task.id}" data-cid="${c.id}" class="opacity-0 group-hover/choiceitem:opacity-100 p-2 rounded-lg hover:bg-black/10 transition-all flex-shrink-0 ${task.selectedChoiceId === c.id ? 'text-[#FDF8F3]' : 'text-[#A1887F] hover:text-[#5D4037]'}">
              <i data-lucide="edit-3" class="w-4 h-4"></i>
            </button>
          </div>` : ''}
        </div>
      `).join('')}
    </div>`;
  } else if (task.type === 'checklist') {
    const checkedCount = (task.checklistItems || []).filter(i => i.isChecked).length;
    const isYogaChecked = (task.checklistItems || []).some(i => (i.id === 'yoga' || i.label.includes('瑜珈')) && i.isChecked);
    const progressPercent = isYogaChecked ? 100 : Math.min(100, Math.round((checkedCount / task.targetCount) * 100));
    const prevPerc = prevProgressState.get(task.id) ?? 0;
    prevProgressState.set(task.id, progressPercent);
    
    innerHtml = `<div class="flex flex-col gap-2 w-full mt-2">
      <div class="flex items-center gap-3 mb-1">
        <div class="flex-grow h-3 bg-stone-100 rounded-full overflow-hidden border border-stone-200">
          <div class="h-full bg-[#8D6E63] progress-animate" style="--start-w: ${prevPerc}%; --end-w: ${progressPercent}%; width: ${progressPercent}%"></div>
        </div>
        <span class="text-xs font-bold text-[#8D6E63] min-w-[3rem] text-right">${isYogaChecked ? '完成' : `${checkedCount}/${task.targetCount}`}</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        ${(task.checklistItems || []).map(item => `
          <div class="group/checkitem w-full flex items-stretch rounded-lg border transition-all text-xs ${item.isChecked ? 'bg-[#5D4037] border-[#5D4037] text-[#FDF8F3]' : `bg-white border-[#EFEBE9] text-[#A1887F] ${isOwner ? 'hover:bg-[#EFEBE9]' : ''}`}">
            <button data-action="toggle-checklist" data-id="${task.id}" data-cid="${item.id}" ${!isOwner ? 'disabled' : ''} class="flex-1 flex items-center justify-between px-3 py-2 text-left min-w-0 ${!isOwner ? 'cursor-default' : 'cursor-pointer'}">
              <span class="truncate pr-1">${item.label}</span>
              ${item.isChecked ? '<i data-lucide="check" class="w-3 h-3 flex-shrink-0"></i>' : ''}
            </button>
            ${isOwner ? `
            <div class="flex items-center pr-1">
              <button data-action="edit-checklist-item" data-id="${task.id}" data-cid="${item.id}" class="opacity-0 group-hover/checkitem:opacity-100 p-1.5 rounded-md hover:bg-black/10 transition-all flex-shrink-0 ${item.isChecked ? 'text-[#FDF8F3]' : 'text-[#A1887F] hover:text-[#5D4037]'}">
                <i data-lucide="edit-3" class="w-3 h-3"></i>
              </button>
            </div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  return `
    <div class="group relative flex flex-col p-5 bg-white rounded-2xl border transition-all ${isCompleted ? 'border-transparent opacity-50 bg-[#EFEBE9]' : 'border-[#EFEBE9] shadow-sm'}">
      <div class="flex items-start gap-3 w-full">
        ${task.type === 'simple' ? `
          <button data-action="toggle-simple" data-id="${task.id}" ${!isOwner ? 'disabled' : ''} class="flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors mt-0.5 ${isCompleted ? 'bg-[#5D4037] border-[#5D4037] text-[#FDF8F3]' : `border-[#BCAAA4] text-transparent ${isOwner ? 'hover:border-[#8D6E63]' : ''}`} ${!isOwner ? 'cursor-default opacity-50' : 'cursor-pointer'}">
            <i data-lucide="check" class="w-3.5 h-3.5" style="stroke-width: 4px;"></i>
          </button>
        ` : `
          <div class="flex-shrink-0 w-6 mt-0.5 flex justify-center">
            <i data-lucide="${task.type === 'progress' ? 'droplets' : task.type === 'checklist' ? 'dumbbell' : getIcon()}" class="w-5 h-5 text-[#8D6E63]"></i>
          </div>
        `}
        <div class="flex-grow min-w-0">
          <div class="flex justify-between items-start min-h-[28px]">
                <div class="flex items-center gap-2 group/title ${isOwner ? 'cursor-pointer' : ''}" ${isOwner ? `data-action="edit-task" data-id="${task.id}" data-field="text"` : ''}>
                  <h4 class="font-bold text-[#4E342E] leading-tight ${isCompleted && task.type === 'simple' ? 'line-through text-[#A1887F]' : ''}">${task.text}</h4>
                  ${isOwner ? '<i data-lucide="edit-3" class="w-3.5 h-3.5 text-[#D7CCC8] hover:text-[#8D6E63] opacity-0 group-hover/title:opacity-100"></i>' : ''}
                </div>
                ${isOwner ? `<button data-action="delete-task" data-id="${task.id}" class="p-1.5 -mt-1.5 -mr-2 text-[#D7CCC8] hover:text-red-400 hover:bg-[#EFEBE9] rounded-lg transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
              </div>
              <div class="mt-1 mb-3">
                <div class="flex items-center gap-2 group/note min-h-[20px] cursor-pointer" data-action="edit-task" data-id="${task.id}" data-field="note">
                  <p class="text-xs text-[#A1887F] flex items-center gap-1"><i data-lucide="message-circle" class="w-2.5 h-2.5"></i> ${task.note || '<span class="italic opacity-50">點擊新增備註...</span>'}</p>
                  <i data-lucide="edit-3" class="w-3 h-3 text-[#D7CCC8] hover:text-[#8D6E63] opacity-0 group-hover/note:opacity-100"></i>
                </div>
              </div>
         ${innerHtml}
            </div>
          </div>
          
          ${task.remedyTargetDate ? `
            <div class="mt-3 pt-3 border-t border-dashed border-[#D7CCC8]">
                <div class="flex items-center justify-between bg-[#FFF3E0] rounded-xl p-3 border border-[#FFE0B2]">
                    <div class="flex items-center gap-2">
                        <i data-lucide="mail" class="w-4 h-4 text-[#E65100]"></i>
                        <span class="text-xs font-bold text-[#E65100]">Double卡補救任務</span>
                    </div>
                    <button data-action="complete-remedy" data-id="${task.id}" ${!isOwner || task.remedyCompleted ? 'disabled' : ''} class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${task.remedyCompleted ? 'bg-[#E65100] text-white' : 'bg-white text-[#E65100] border border-[#FFCC80] hover:bg-[#FFE0B2] cursor-pointer'}">
                        ${task.remedyCompleted ? '<i data-lucide="check" class="w-3.5 h-3.5"></i> 已補救' : '補救嗷啦！'}
                    </button>
                </div>
            </div>
          ` : ''}
          
        </div>
      `;
    };
// --- 寶包有話要說：公告 Modal 邏輯 ---
    let announcementShownThisSession = false; // 紀錄這次打開網頁是否已經顯示過了
    
    window.showAnnouncementModal = () => {
        if (announcementShownThisSession) return; // 如果剛才已經跳過，就不要再煩人
        
        const todayStr = getLogicDateString();
        // 檢查 localStorage 裡面記的日期，是不是等於今天
        if (localStorage.getItem('hide_announcement_date') === todayStr) return; 
        
        announcementShownThisSession = true; 

        const html = `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E342E]/40 backdrop-blur-sm fade-in" onclick="if(event.target === this) closeAnnouncement()">
                <div class="bg-[#FDF8F3] rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#D7CCC8] p-6 relative slide-up">
                    <button onclick="closeAnnouncement()" class="absolute top-4 right-4 p-2 bg-[#EFEBE9] rounded-full text-[#8D6E63] hover:bg-[#D7CCC8] transition-colors">
                        <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                    
                    <div class="text-center mb-6 mt-2">
                        <div class="inline-flex items-center justify-center p-3 bg-white rounded-full shadow-sm border border-[#EFEBE9] mb-3">
                            <i data-lucide="megaphone" class="w-6 h-6 text-[#8D6E63] fill-[#D7CCC8]"></i>
                        </div>
                        <h3 class="text-xl font-bold text-[#5D4037]">寶包有話要說嗷嗷嗷</h3>
                    </div>
                    
                    <div class="bg-white p-5 rounded-2xl border border-[#EFEBE9] shadow-sm mb-6">
                        <p class="text-[#5D4037] text-sm leading-relaxed text-center font-bold">
                            現在點所有的叉叉都可以關掉了嗷嗷嗷，<br>點空白處也還是可以嗷嗷！
                        </p>
                    </div>
                    
                    <label class="flex items-center justify-center gap-2 mb-5 cursor-pointer group w-fit mx-auto">
                        <input type="checkbox" id="dont-show-today" class="w-4 h-4 accent-[#8D6E63] cursor-pointer rounded border-[#D7CCC8]">
                        <span class="text-xs text-[#8D6E63] font-bold group-hover:text-[#5D4037] transition-colors">今天不再顯示此公告</span>
                    </label>
                    
                    <button onclick="closeAnnouncement()" class="w-full py-3 bg-[#5D4037] text-white rounded-xl font-bold text-sm hover:bg-[#3E2723] transition-colors shadow-md">我知道了</button>
                </div>
            </div>
        `;
        document.getElementById('modals').innerHTML = html;
        lucide.createIcons();
    };

    window.closeAnnouncement = () => {
        const isChecked = document.getElementById('dont-show-today')?.checked;
        if (isChecked) {
            localStorage.setItem('hide_announcement_date', getLogicDateString());
        }
        document.getElementById('modals').innerHTML = '';
        window.checkDoubleCard(); // 公告關閉後，接著檢查 Double 卡
    };

    // --- Double 卡補救機制 ---
    window.checkDoubleCard = () => {
        if (!state.identity || !state.user) return;
        const todayStr = getLogicDateString();
        // 如果今天已經處理過（拒絕或找不到），就不再煩人
        if (localStorage.getItem(`double_card_prompt_${state.identity}`) === todayStr) return;

        // 計算昨天的邏輯日期
        const now = new Date();
        if (now.getHours() < 5) now.setDate(now.getDate() - 1);
        now.setDate(now.getDate() - 1); 
        const yStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const yRecord = state.calendarRecords[yStr];
        if (!yRecord) { localStorage.setItem(`double_card_prompt_${state.identity}`, todayStr); return; }

        const details = state.identity === '寶寶' ? yRecord.babyDetails : yRecord.uncleDetails;
        if (!details || !details.missed) { localStorage.setItem(`double_card_prompt_${state.identity}`, todayStr); return; }

        // 篩選出昨天的「每日任務」（排除每週任務）
        const missedDaily = details.missed.filter(missedText => {
            const taskObj = state.tasks.find(t => t.owner === state.identity && (t.originalText || t.text) === missedText);
            return taskObj && !isTaskWeekly(taskObj);
        });

        // 條件：剛好只有 1 項每日任務沒完成
        if (missedDaily.length === 1) {
            const missedTaskText = missedDaily[0];
            const taskObj = state.tasks.find(t => t.owner === state.identity && (t.originalText || t.text) === missedTaskText);
            
            if (taskObj && taskObj.remedyTargetDate === yStr) return; // 已經按過「我要！！」了
            
            if (taskObj) {
                showDoubleCardModal(missedTaskText, yStr, taskObj.id);
                return; // 成功顯示，中斷往下儲存
            }
        }
        
        // 其他情況（全完成、漏掉 >= 2 項），標記為今天已檢查
        localStorage.setItem(`double_card_prompt_${state.identity}`, todayStr);
    };

    window.showDoubleCardModal = (taskText, targetDate, taskId) => {
        const html = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E342E]/40 backdrop-blur-sm fade-in" onclick="if(event.target === this) closeDoubleCard()">
            <div class="bg-[#FDF8F3] rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#D7CCC8] p-6 relative slide-up text-center">
                <div class="inline-flex items-center justify-center p-3 bg-white rounded-full shadow-sm border border-[#EFEBE9] mb-4 mt-2">
                    <i data-lucide="mail" class="w-6 h-6 text-[#8D6E63] fill-[#EFEBE9]"></i>
                </div>
                <h3 class="text-xl font-bold text-[#5D4037] mb-4">叮叮！泥昨天有一項任務沒有完成</h3>
                
                <div class="bg-white p-4 rounded-2xl border border-[#EFEBE9] shadow-sm mb-6 text-center">
                    <p class="text-[#5D4037] text-sm font-bold mb-3">今天要使用 double 卡彌補嘛？</p>
                    <p class="text-xs text-[#8D6E63] p-2 bg-[#FDF8F3] rounded-xl border border-[#D7CCC8] font-bold">${taskText}</p>
                </div>
                <div class="flex gap-3">
                    <button onclick="closeDoubleCard()" class="flex-1 py-3 bg-[#EFEBE9] text-[#8D6E63] rounded-xl font-bold text-sm hover:bg-[#D7CCC8] transition-colors">今天累累</button>
                    <button onclick="acceptDoubleCard('${taskId}', '${targetDate}')" class="flex-1 py-3 bg-[#5D4037] text-white rounded-xl font-bold text-sm hover:bg-[#3E2723] transition-colors shadow-md">我要！！</button>
                </div>
            </div>
        </div>
        `;
        document.getElementById('modals').innerHTML = html;
        lucide.createIcons();
    };

    window.closeDoubleCard = () => {
        localStorage.setItem(`double_card_prompt_${state.identity}`, getLogicDateString());
        document.getElementById('modals').innerHTML = '';
    };

    window.acceptDoubleCard = async (taskId, targetDate) => {
        localStorage.setItem(`double_card_prompt_${state.identity}`, getLogicDateString());
        document.getElementById('modals').innerHTML = '';
        if (taskId) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', taskId), {
                remedyTargetDate: targetDate,
                remedyCompleted: false
            });
        }
    };

let renderTimer = null;
const scheduleRender = () => {
  if (renderTimer) cancelAnimationFrame(renderTimer);
  renderTimer = requestAnimationFrame(() => {
    render();
  });
};
 
const render = () => {
      const appDiv = document.getElementById('app');
      if (!state.identity) {
        appDiv.innerHTML = renderLogin();
      } else {
        appDiv.innerHTML = renderDashboard();
        
        // 渲染完主畫面後，稍微延遲 0.3 秒再跳出公告，讓視覺過渡比較滑順
        setTimeout(() => {
            if (window.showAnnouncementModal && !announcementShownThisSession && localStorage.getItem('hide_announcement_date') !== getLogicDateString()) {
                window.showAnnouncementModal();
            } else {
                window.checkDoubleCard(); // 如果不顯示公告，就直接檢查 Double 卡
            }
        }, 300);
      }
      lucide.createIcons();
    };

// --- 事件處理與代理 (寫入雲端) ---
document.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action.startsWith('edit-')) {
     e.preventDefault();
     e.stopPropagation();
  }

  try {
    if (action === 'google-login') {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (err) {
            console.error(err);
            window.showAlert("登入失敗，請重試！<br>" + err.message);
        }
    }
    else if (action === 'set-identity') {
      state.identity = target.dataset.id;
      localStorage.setItem('task_app_identity', state.identity);
      scheduleRender();
    } 
    else if (action === 'logout') {
      window.showConfirm("確定要登出這個裝置嗎？", async () => {
          await signOut(auth); // 徹底登出 Google 帳號
          state.identity = null;
          state.user = null;
          localStorage.removeItem('task_app_identity');
          scheduleRender();
      });
    }
    else if (action === 'set-tab') {
      state.activeTab = target.dataset.tab;
      scheduleRender();
    }
    else if (action === 'cal-prev') {
      state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() - 1, 1);
      scheduleRender();
    }
    else if (action === 'cal-next') {
      state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + 1, 1);
      scheduleRender();
    }
    else if (action === 'open-day-detail') {
      const dateStr = target.dataset.date;
      const record = state.calendarRecords[dateStr];
      openDayDetailModal(dateStr, record);
    }
    else if (action === 'toggle-simple') {
      const task = state.tasks.find(t => String(t.id) === String(id));
      if (task && task.owner === state.identity) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', id), { completed: !task.completed });
      }
    }
    else if (action === 'update-water') {
      const task = state.tasks.find(t => String(t.id) === String(id));
      if (task && task.owner === state.identity) {
        const amount = parseInt(target.dataset.val);
        let newVal = (task.currentValue || 0) + amount;
        if (newVal > task.targetValue) newVal = task.targetValue;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', id), { currentValue: newVal, completed: newVal >= task.targetValue });
      }
    }
    else if (action === 'custom-update-water') {
      const task = state.tasks.find(t => String(t.id) === String(id));
      if (task && task.owner === state.identity) {
        const inputEl = document.getElementById(`custom-val-${id}`);
        const inputVal = parseInt(inputEl.value);
        if (!isNaN(inputVal) && inputVal > 0) {
           const sign = parseInt(target.dataset.sign);
           let newVal = (task.currentValue || 0) + (inputVal * sign);
           if (newVal < 0) newVal = 0;
           if (newVal > task.targetValue) newVal = task.targetValue;
           await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', id), { currentValue: newVal, completed: newVal >= task.targetValue });
           inputEl.value = ''; 
        } else {
           window.showAlert("請輸入有效的正整數數值！");
        }
      }
    }
    else if (action === 'toggle-choice') {
      const task = state.tasks.find(t => String(t.id) === String(id));
      const cid = target.dataset.cid;
      if (task && task.owner === state.identity) {
        const newSelection = task.selectedChoiceId === cid ? null : cid;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', id), { selectedChoiceId: newSelection, completed: !!newSelection });
      }
    }
    else if (action === 'toggle-checklist') {
      const task = state.tasks.find(t => String(t.id) === String(id));
      const cid = target.dataset.cid;
      if (task && task.owner === state.identity) {
        const newItems = task.checklistItems.map(i => String(i.id) === String(cid) ? { ...i, isChecked: !i.isChecked } : i);
        const checkedCount = newItems.filter(i => i.isChecked).length;
        const isYogaChecked = newItems.some(i => (i.id === 'yoga' || i.label.includes('瑜珈')) && i.isChecked);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', id), { checklistItems: newItems, completed: isYogaChecked || checkedCount >= task.targetCount });
      }
    }
    else if (action === 'complete-remedy') {
          const task = state.tasks.find(t => String(t.id) === String(id));
          if (task && task.owner === state.identity && !task.remedyCompleted) {
             // 1. 完成今日補救項目
             await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', id), { remedyCompleted: true });

             // 2. 更新昨天的日曆紀錄
             const targetDate = task.remedyTargetDate;
             if (targetDate) {
                 const record = state.calendarRecords[targetDate] || {};
                 const detailsKey = state.identity === '寶寶' ? 'babyDetails' : 'uncleDetails';
                 const details = record[detailsKey] || {};
                 const remediedList = details.remedied || [];
                 const taskText = task.originalText || task.text;
                 
                 if (!remediedList.includes(taskText)) {
                     remediedList.push(taskText);
                     await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_records', targetDate), {
                         [detailsKey]: { ...details, remedied: remediedList }
                     }, { merge: true });
                 }
             }
          }
        }
    else if (action === 'delete-task') {
      window.showConfirm('確定要永久刪除這個任務嗎？\n(刪除後將不再顯示，如需恢復需手動新增)', async () => {
         await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', id));
      });
    }
    else if (action === 'edit-task') {
          const task = state.tasks.find(t => String(t.id) === String(id));
          const field = target.dataset.field;
          if (task) {
             if (field === 'text' && task.owner !== state.identity) {
                return; // 標題只能由擁有人自己修改 (不再阻擋預設任務)
             }
             window.openEditModal(task.id, field, null, task[field] || '', field === 'text' ? '修改任務名稱' : '互相留言給對方');
          }
        }
    else if (action === 'edit-checklist-item') {
      const task = state.tasks.find(t => String(t.id) === String(id));
      const cid = target.dataset.cid;
      if (task && task.owner === state.identity && task.checklistItems) {
        const item = task.checklistItems.find(i => String(i.id) === String(cid));
        if (item) {
           window.openEditModal(task.id, 'checklist-item', cid, item.label, '修改子項目名稱');
        }
      }
    }
    else if (action === 'edit-choice-item') {
      const task = state.tasks.find(t => String(t.id) === String(id));
      const cid = target.dataset.cid;
      if (task && task.owner === state.identity && task.choices) {
        const choice = task.choices.find(c => String(c.id) === String(cid));
        if (choice) {
           window.openEditModal(task.id, 'choice-item', cid, choice.label, '修改選項名稱');
        }
      }
    }
    else if (action === 'edit-motto') {
       const currentDay = new Date().getDate();
       if (currentDay > 7) { window.showAlert("只有每月前7天可以修改座右銘喔！"); return; }
       const currentMonthKey = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;
       const count = state.mottoData.monthKey === currentMonthKey ? (state.mottoData.editCount || 0) : 0;
       if (count >= 3) { window.showAlert("本月修改次數已達上限 (3次)！"); return; }
       
       window.openEditModal(null, 'motto', null, state.mottoData.text, `修改座右銘 (本月剩餘 ${3-count} 次)`);
    }
    else if (action === 'delete-bank') {
       window.showConfirm("確定要刪除這筆紀錄嗎？", async () => {
         await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_bank_records', id));
       });
    }
    else if (action === 'reload-defaults') {
       window.showConfirm('確定要重新載入預設任務嗎？\n這會補回您可能不小心刪除的項目。', async () => {
          const targetUser = state.identity;
          const tasksToInject = targetUser === '寶寶' ? DEFAULT_BABY_TASKS : DEFAULT_UNCLE_TASKS;
          const todayStr = getLogicDateString();
          
          const existingTasks = state.tasks.filter(t => t.owner === targetUser);
          let injectedCount = 0;
          
          for (const task of tasksToInject) {
              if (!existingTasks.some(t => (t.originalText || t.text) === task.text)) {
                  await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks'), { 
                      ...task, createdAt: Date.now(), createdByUid: state.user.uid, lastUpdatedDate: todayStr 
                  });
                  injectedCount++;
              }
          }
          if (injectedCount > 0) window.showAlert(`已成功補回 ${injectedCount} 個預設任務！`);
          else window.showAlert("您目前沒有遺失任何預設任務喔！");
       });
    }
    else if (action === 'open-add-task') {
       document.getElementById('modals').innerHTML = getAddTaskModalHtml();
       lucide.createIcons();
    }
    else if (action === 'open-add-bank') {
       window._bankModalState = { targetUser: '大叔', type: 'money', mode: 'add', amount: '50', note: '' };
       updateBankModalHtml();
    }
    else if (action === 'close-modal') {
       document.getElementById('modals').innerHTML = '';
    }
  } catch (err) { console.error("Action error", err); }
});

// --- Modal Submit 與資料庫更新邏輯 ---
// 3. 修改文字/備註 Modal
    window._editModalState = { id: null, type: null, cid: null, value: '' };
    window.openEditModal = (id, type, cid, currentValue, title) => {
      window._editModalState = { id, type, cid, value: currentValue };
      const safeValue = currentValue.replace(/"/g, '&quot;');
      const html = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E342E]/40 backdrop-blur-sm fade-in" onclick="if(event.target === this) document.getElementById('modals').innerHTML=''">
          <div class="bg-[#FDF8F3] rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#D7CCC8] slide-up">
            <div class="p-5 border-b border-[#EFEBE9] flex justify-between items-center bg-white">
              <h3 class="text-lg font-bold text-[#5D4037] flex items-center gap-2"><i data-lucide="edit-3" class="w-5 h-5 text-[#8D6E63]"></i>${title}</h3>
              <button data-action="close-modal" class="p-2 bg-[#EFEBE9] rounded-full text-[#8D6E63] hover:bg-[#D7CCC8] transition-colors">
                 <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
              </button>
            </div>
            <form onsubmit="submitEdit(event)" class="p-6">
              <input type="text" id="edit-input-val" value="${safeValue}" class="w-full bg-white border border-[#D7CCC8] rounded-xl p-3 text-[#4E342E] focus:outline-none focus:border-[#8D6E63] shadow-inner" autocomplete="off" />
              <div class="pt-6 flex gap-3">
                <button type="button" data-action="close-modal" class="flex-1 py-3 bg-[#EFEBE9] text-[#8D6E63] rounded-xl font-bold text-sm hover:bg-[#D7CCC8] transition-colors">取消</button>
                <button type="submit" class="flex-1 py-3 bg-[#5D4037] text-[#FDF8F3] rounded-xl font-bold text-sm hover:bg-[#3E2723] transition-colors">確認儲存</button>
              </div>
            </form>
          </div>
        </div>
      `;
      document.getElementById('modals').innerHTML = html;
      lucide.createIcons();
      setTimeout(() => {
         const input = document.getElementById('edit-input-val');
         if(input) { input.focus(); input.select(); }
      }, 50);
    };

    window.submitEdit = async (e) => {
      e.preventDefault();
      const { id, type, cid } = window._editModalState;
      const newVal = document.getElementById('edit-input-val').value.trim();
      if (!newVal) return;

      if (type === 'motto') {
         const currentMonthKey = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;
         await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'app_settings', 'config'), { motto: { text: newVal, editCount: (state.mottoData.editCount || 0) + 1, monthKey: currentMonthKey } }, { merge: true });
      } else {
         const task = state.tasks.find(t => String(t.id) === String(id));
         if (task) {
           let updateData = {};
           if (type === 'text') {
             updateData.text = newVal;
             // 【防呆機制】如果改的是預設任務，幫它偷偷記下原本的名字，避免被系統重複生成
             if (task.isDefault && !task.originalText) {
                updateData.originalText = task.text;
             }
           } else if (type === 'note') {
             updateData.note = newVal;
           } else if (type === 'checklist-item') {
             updateData.checklistItems = task.checklistItems.map(i => String(i.id) === String(cid) ? { ...i, label: newVal } : i);
           } else if (type === 'choice-item') {
             updateData.choices = task.choices.map(c => String(c.id) === String(cid) ? { ...c, label: newVal } : c);
           }
           await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks', id), updateData);
         }
      }
      document.getElementById('modals').innerHTML = '';
    };

    window.submitAddTask = async (e) => {
       e.preventDefault();
       const title = document.getElementById('new-task-title').value.trim();
       if(!title) return;
       const note = document.getElementById('new-task-note').value;
       const taskData = { text: title, note: note, type: 'simple', completed: false, owner: state.identity, createdAt: Date.now(), createdByUid: state.user.uid, lastUpdatedDate: getLogicDateString(), order: 100, isDefault: false };
       await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'challenge_tasks'), taskData);
       document.getElementById('modals').innerHTML = '';
    };

    // 4. 新增臨時任務 Modal
    const getAddTaskModalHtml = () => `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E342E]/40 backdrop-blur-sm fade-in" onclick="if(event.target === this) document.getElementById('modals').innerHTML=''">
        <div class="bg-[#FDF8F3] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-[#D7CCC8] slide-up">
          <div class="p-5 border-b border-[#EFEBE9] flex justify-between items-center bg-white">
            <h3 class="text-lg font-bold text-[#5D4037] flex items-center gap-2"><i data-lucide="plus" class="w-5 h-5 text-[#8D6E63]"></i>新增臨時任務</h3>
            <button data-action="close-modal" class="p-2 bg-[#EFEBE9] rounded-full text-[#8D6E63] hover:bg-[#D7CCC8] transition-colors">
               <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
            </button>
          </div>
          <form onsubmit="submitAddTask(event)" class="p-6">
            <div class="space-y-4">
              <div><label class="block text-xs font-bold text-[#8D6E63] mb-2">任務名稱</label><input id="new-task-title" type="text" placeholder="例如：買牛奶" class="w-full bg-white border border-[#D7CCC8] rounded-xl p-3 text-[#4E342E] focus:outline-none focus:border-[#8D6E63]" required autofocus /></div>
              <div><label class="block text-xs font-bold text-[#8D6E63] mb-2">任務備註 (選填)</label><textarea id="new-task-note" rows="2" placeholder="寫點什麼..." class="w-full bg-white border border-[#D7CCC8] rounded-xl p-3 text-[#4E342E] focus:outline-none focus:border-[#8D6E63] resize-none"></textarea></div>
            </div>
            <div class="pt-6 flex gap-3">
              <button type="button" data-action="close-modal" class="flex-1 py-3 bg-[#EFEBE9] text-[#8D6E63] rounded-xl font-bold text-sm hover:bg-[#D7CCC8] transition-colors">取消</button>
              <button type="submit" class="flex-1 py-3 bg-[#5D4037] text-[#FDF8F3] rounded-xl font-bold text-sm hover:bg-[#3E2723] transition-colors">建立</button>
            </div>
          </form>
        </div>
      </div>
    `;

    window.setBankModalState = (key, val) => { window._bankModalState[key] = val; updateBankModalHtml(); };
    window.submitAddBank = async () => {
       const { targetUser, type, mode, amount, note } = window._bankModalState;
       let finalAmount = parseInt(amount);
       if (isNaN(finalAmount)) return;
       if (mode === 'sub') finalAmount = -finalAmount;
       
       await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'challenge_bank_records'), { who: targetUser, type: type, amount: finalAmount, note: document.getElementById('bank-note').value, date: getLogicDateString(), createdAt: Date.now() });
       document.getElementById('modals').innerHTML = '';
    };

    // 5. 叔寶銀行 Modal
    const updateBankModalHtml = () => {
       const s = window._bankModalState;
       const html = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E342E]/40 backdrop-blur-sm fade-in" onclick="if(event.target === this) document.getElementById('modals').innerHTML=''">
          <div class="bg-[#FDF8F3] rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl border border-[#D7CCC8] p-6 relative slide-up">
             <button data-action="close-modal" class="absolute top-4 right-4 p-2 bg-[#EFEBE9] rounded-full text-[#8D6E63] hover:bg-[#D7CCC8] transition-colors">
                <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
             </button>
             <div class="mb-5 pr-6"><h3 class="font-bold text-[#5D4037]">新增銀行紀錄</h3></div>
             <div class="space-y-4">
                <div class="flex gap-2 bg-[#EFEBE9] p-1 rounded-xl">
                  <button onclick="setBankModalState('mode', 'add')" class="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${s.mode === 'add' ? 'bg-white text-red-800 shadow-sm' : 'text-[#A1887F]'}"><i data-lucide="trending-up" class="w-3.5 h-3.5 pointer-events-none"></i> 增加懲罰</button>
                  <button onclick="setBankModalState('mode', 'sub')" class="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${s.mode === 'sub' ? 'bg-white text-green-700 shadow-sm' : 'text-[#A1887F]'}"><i data-lucide="trending-down" class="w-3.5 h-3.5 pointer-events-none"></i> 抵銷/償還</button>
                </div>
                <div class="flex gap-2">
                  <button onclick="setBankModalState('targetUser', '大叔'); setBankModalState('type', 'money'); setBankModalState('amount', '50');" class="flex-1 py-2 rounded-lg text-sm font-bold border ${s.targetUser === '大叔' ? 'bg-[#5D4037] text-white border-[#5D4037]' : 'bg-white text-[#A1887F] border-[#D7CCC8]'}">大叔</button>
                  <button onclick="setBankModalState('targetUser', '寶寶'); setBankModalState('type', 'kiss'); setBankModalState('amount', '10');" class="flex-1 py-2 rounded-lg text-sm font-bold border ${s.targetUser === '寶寶' ? 'bg-[#5D4037] text-white border-[#5D4037]' : 'bg-white text-[#A1887F] border-[#D7CCC8]'}">寶寶</button>
                </div>
                <div class="flex gap-2">
                  <button onclick="setBankModalState('type', 'money')" class="flex-1 py-2 rounded-lg text-xs font-bold border ${s.type === 'money' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-[#A1887F] border-[#D7CCC8]'}">💰 金額</button>
                  <button onclick="setBankModalState('type', 'kiss')" class="flex-1 py-2 rounded-lg text-xs font-bold border ${s.type === 'kiss' ? 'bg-pink-100 text-pink-800 border-pink-300' : 'bg-white text-[#A1887F] border-[#D7CCC8]'}">💋 親親</button>
                </div>
                <div><label class="block text-xs font-bold text-[#8D6E63] mb-1">${s.mode === 'add' ? '增加數量' : (s.type === 'money' ? '償還金額' : '已親次數')} (${s.type === 'money' ? '元' : '下'})</label><input type="number" onchange="setBankModalState('amount', this.value)" value="${s.amount}" class="w-full p-2 rounded-lg border border-[#D7CCC8] text-[#5D4037] focus:outline-none"/></div>
                <div><label class="block text-xs font-bold text-[#8D6E63] mb-1">原因 (選填)</label><input id="bank-note" type="text" placeholder="${s.mode === 'add' ? '例如：沒喝水' : '例如：請吃飯 / 已兌現'}" class="w-full p-2 rounded-lg border border-[#D7CCC8] text-[#5D4037] focus:outline-none"/></div>
                <button onclick="submitAddBank()" class="w-full py-3 text-white rounded-xl font-bold mt-2 ${s.mode === 'add' ? 'bg-[#5D4037]' : 'bg-green-600'}">${s.mode === 'add' ? '確認新增' : '確認抵銷'}</button>
             </div>
          </div>
        </div>
       `;
       document.getElementById('modals').innerHTML = html;
       lucide.createIcons();
    };

    // 6. 點擊日曆查看詳情 Modal
    const openDayDetailModal = (dateStr, record) => {
      const [year, month, day] = dateStr.split('-');
      const babyMissed = record?.babyDetails?.missed || [];
      const uncleMissed = record?.uncleDetails?.missed || [];
      const babyTotal = record?.babyDetails?.total || 0;
      const uncleTotal = record?.uncleDetails?.total || 0;
      const hasRecord = !!record;
      const babyAllDone = babyTotal > 0 && babyMissed.length === 0;
      const uncleAllDone = uncleTotal > 0 && uncleMissed.length === 0;

      const html = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E342E]/40 backdrop-blur-sm fade-in" onclick="if(event.target === this) document.getElementById('modals').innerHTML=''">
          <div class="bg-[#FDF8F3] rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#D7CCC8] p-6 relative slide-up">
            <button data-action="close-modal" class="absolute top-4 right-4 p-2 bg-[#EFEBE9] rounded-full text-[#8D6E63] hover:bg-[#D7CCC8] transition-colors">
               <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
            </button>
            <div class="text-center mb-6 mt-2"><h3 class="text-xl font-bold text-[#5D4037]">${year}年${month}月${day}日</h3><p class="text-xs text-[#A1887F] mt-1">當日執行狀況</p></div>
            ${!hasRecord ? `<div class="text-center py-8 text-[#A1887F] bg-white rounded-2xl border border-dashed border-[#D7CCC8]"><p>這一天沒有挑戰紀錄喔 😴</p></div>` : `
              <div class="space-y-4">
                <div class="bg-white p-4 rounded-2xl border border-[#FFE0B2] shadow-sm">
                   <div class="flex justify-between items-center mb-2 border-b border-[#FFF3E0] pb-2"><h4 class="font-bold text-[#8D6E63] flex items-center gap-2"><i data-lucide="sparkles" class="w-4 h-4"></i> 寶寶</h4>${babyAllDone ? '<span class="text-lg">💅</span>' : ''}</div>
                   ${babyTotal === 0 ? '<p class="text-xs text-[#D7CCC8]">無任務</p>' : babyAllDone ? '<p class="text-xs text-[#8D6E63] font-bold flex items-center gap-1"><i data-lucide="check" class="w-3 h-3"></i> 任務全數完成！太棒了！</p>' : `<div><p class="text-[10px] text-[#A1887F] mb-1">未完成項目：</p><ul class="list-disc list-inside space-y-1">${babyMissed.map(t => { const isRemedied = record?.babyDetails?.remedied?.includes(t); return `<li class="text-xs text-[#8D6E63]">${isRemedied ? `<s class="opacity-60">${t}</s> <span class="text-green-600 font-bold ml-1">守住了嗷嗷嗷！</span>` : t}</li>`; }).join('')}</ul></div>`}
                </div>
                <div class="bg-white p-4 rounded-2xl border border-[#E0E0E0] shadow-sm">
                   <div class="flex justify-between items-center mb-2 border-b border-[#F5F5F5] pb-2"><h4 class="font-bold text-[#616161] flex items-center gap-2"><i data-lucide="heart" class="w-4 h-4"></i> 大叔</h4>${uncleAllDone ? '<span class="text-lg">💋</span>' : ''}</div>
                   ${uncleTotal === 0 ? '<p class="text-xs text-[#D7CCC8]">無任務</p>' : uncleAllDone ? '<p class="text-xs text-[#616161] font-bold flex items-center gap-1"><i data-lucide="check" class="w-3 h-3"></i> 任務全數完成！太強了！</p>' : `<div><p class="text-[10px] text-[#9E9E9E] mb-1">未完成項目：</p><ul class="list-disc list-inside space-y-1">${uncleMissed.map(t => { const isRemedied = record?.uncleDetails?.remedied?.includes(t); return `<li class="text-xs text-[#757575]">${isRemedied ? `<s class="opacity-60">${t}</s> <span class="text-green-600 font-bold ml-1">守住了嗷嗷嗷！</span>` : t}</li>`; }).join('')}</ul></div>`}
                </div>
              </div>
            `}
          </div>
        </div>
      `;
      document.getElementById('modals').innerHTML = html;
      lucide.createIcons();
    };

// 啟動應用程式
initApp();