/* ==========================================================================
   Merj — app logic. Most of this is still a client-side prototype, but real
   accounts, real email verification, and real Discover data are now backed
   by Supabase (see sql/001_schema.sql for the schema this code assumes).
   ========================================================================== */

(function(){
  "use strict";

  // Backend client. Falls back to null (rather than throwing) if the config/library didn't
  // load, so the rest of the app -- demo accounts, guest mode, mock deck -- keeps working
  // exactly as before even with no backend reachable.
  const sb = (typeof window.supabase !== "undefined" && window.MERJ_SUPABASE_URL)
    ? window.supabase.createClient(window.MERJ_SUPABASE_URL, window.MERJ_SUPABASE_KEY)
    : null;

  /* ---------------- Illustrated avatars ----------------
     No real people's photos are used for mock/demo profiles: stock-photo licenses generally
     exclude "sensitive use" contexts like dating apps, and putting a real identifiable face on
     a fake profile risks implying that person uses/endorses the platform. These are original,
     generated illustrations instead — safe to ship, no license or likeness concerns. */
  const HAIR_SHAPES = {
    short: hair => `<path d="M18 46 C18 20 82 20 82 46 L82 34 C82 14 18 14 18 34 Z" fill="${hair}"/>`,
    long:  hair => `<path d="M15 96 C10 40 20 14 50 14 C80 14 90 40 85 96 L72 96 C76 55 68 30 50 30 C32 30 24 55 28 96 Z" fill="${hair}"/>`,
    curly: hair => `<circle cx="28" cy="34" r="13" fill="${hair}"/><circle cx="50" cy="18" r="15" fill="${hair}"/><circle cx="72" cy="34" r="13" fill="${hair}"/><circle cx="38" cy="22" r="12" fill="${hair}"/><circle cx="62" cy="22" r="12" fill="${hair}"/>`,
    bun:   hair => `<path d="M18 46 C18 20 82 20 82 46 L82 36 C82 16 18 16 18 36 Z" fill="${hair}"/><circle cx="50" cy="10" r="9" fill="${hair}"/>`,
    beard: hair => `<path d="M22 50 C22 24 78 24 78 50 L78 38 C78 18 22 18 22 38 Z" fill="${hair}"/><path d="M28 62 C28 82 72 82 72 62 L70 48 C70 68 30 68 30 48 Z" fill="${hair}"/>`,
    bald:  ()   => ``,
  };

  function personSVG({ bg, skin, hair, style, top }){
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="${bg}"/>
      <path d="M8 100 C8 66 28 60 50 60 C72 60 92 66 92 100 Z" fill="${top}"/>
      <circle cx="50" cy="46" r="24" fill="${skin}"/>
      ${(HAIR_SHAPES[style] || HAIR_SHAPES.short)(hair)}
      <circle cx="41" cy="48" r="2.6" fill="#33222b"/>
      <circle cx="59" cy="48" r="2.6" fill="#33222b"/>
      <path d="M42 58 Q50 64 58 58" stroke="#33222b" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  // A small set of "photos" per profile (varied backdrop/outfit tint) so multi-photo browsing has something real to page through.
  function personSVGSet(params){
    const alt1 = { ...params, bg: shiftHex(params.bg, -14), top: shiftHex(params.top, 18) };
    const alt2 = { ...params, bg: shiftHex(params.bg, 14), top: shiftHex(params.top, -18) };
    return [personSVG(params), personSVG(alt1), personSVG(alt2)];
  }
  function shiftHex(hex, amt){
    const n = parseInt(hex.slice(1), 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    const r = clamp(((n>>16)&255) + amt), g = clamp(((n>>8)&255) + amt), b = clamp((n&255) + amt);
    return "#" + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1);
  }

  /* ---------------- Mock data ---------------- */
  const REASON_OPTIONS = ["No strings fun","Same day sex","Just friends","Long term","Dinner dates","Video chat fun"];

  // Trust-signal mock fields below (declaredCountry/ipCountry/phoneCountry/aiPhotoSuspected/
  // duplicateImageFlag/accountAgeDays/likeRatio) simulate data a real backend would collect.
  // Two profiles (Sam, Cian) are seeded with red flags on purpose to demonstrate the scoring engine.
  const PROFILES = [
    { id:1, name:"Aoife", age:27, distance:2, initial:"A", verified:true, reasons:["Dinner dates","Long term"], bio:"Coffee snob, terrible at bowling, great at conversation.", has18:false, interests:["hiking","coffee","live music"],
      declaredCountry:"IE", ipCountry:"IE", phoneCountry:"IE", aiPhotoSuspected:false, duplicateImageFlag:false, accountAgeDays:210, likeRatio:0.31 },
    { id:2, name:"Sam", age:31, distance:5, initial:"S", verified:true, reasons:["No strings fun","Video chat fun"], bio:"Here for a good time, ideally with good chat first. Message me on WhatsApp for pics!", has18:true, ext18Mode:"request", interests:["gym","gaming"],
      declaredCountry:"IE", ipCountry:"NG", phoneCountry:"NG", aiPhotoSuspected:true, duplicateImageFlag:true, accountAgeDays:1, likeRatio:0.97 },
    { id:3, name:"Priya", age:24, distance:8, initial:"P", verified:false, reasons:["Just friends","Dinner dates"], bio:"New to the city, looking for people to explore it with.", has18:false, interests:["food","art","travel"],
      declaredCountry:"IE", ipCountry:"IE", phoneCountry:"GB", aiPhotoSuspected:false, duplicateImageFlag:false, accountAgeDays:14, likeRatio:0.42 },
    { id:4, name:"Jordan", age:29, distance:12, initial:"J", verified:true, reasons:["Long term"], bio:"Dog dad. Will absolutely show you photos of the dog.", has18:false, interests:["dogs","running"],
      declaredCountry:"IE", ipCountry:"IE", phoneCountry:"IE", aiPhotoSuspected:false, duplicateImageFlag:false, accountAgeDays:340, likeRatio:0.22 },
    { id:5, name:"Maeve", age:33, distance:3, initial:"M", verified:true, reasons:["Same day sex","No strings fun"], bio:"Direct, honest, not here to waste anyone's time.", has18:true, ext18Mode:"open", interests:["yoga","wine"],
      declaredCountry:"IE", ipCountry:"IE", phoneCountry:"IE", aiPhotoSuspected:false, duplicateImageFlag:false, accountAgeDays:95, likeRatio:0.28 },
    { id:6, name:"Cian", age:26, distance:15, initial:"C", verified:false, reasons:["Just friends"], bio:"Musician. Will not make you listen to my demos, promise. Invest with me on crypto, easy returns!", has18:false, interests:["music","cycling"],
      declaredCountry:"IE", ipCountry:"IE", phoneCountry:"IE", aiPhotoSuspected:true, duplicateImageFlag:false, accountAgeDays:2, likeRatio:0.88 },
    { id:7, name:"Beth", age:30, distance:6, initial:"B", verified:true, reasons:["Dinner dates","Video chat fun"], bio:"Ask me about the time I got lost in Lisbon for 3 days.", has18:false, interests:["travel","photography"],
      declaredCountry:"IE", ipCountry:"IE", phoneCountry:"IE", aiPhotoSuspected:false, duplicateImageFlag:false, accountAgeDays:180, likeRatio:0.35 },
    { id:8, name:"Rio", age:28, distance:9, initial:"R", verified:true, reasons:["Long term","Dinner dates"], bio:"Slow mornings, good food, honest people.", has18:false, interests:["cooking","reading"],
      declaredCountry:"IE", ipCountry:"IE", phoneCountry:"IE", aiPhotoSuspected:false, duplicateImageFlag:false, accountAgeDays:260, likeRatio:0.19 },
  ];

  // Mock "who liked you" pool — a real backend would derive this from actual right-swipes on your profile.
  const LIKES_RECEIVED = [
    { id:101, name:"Niamh", age:26, distance:4, initial:"N" },
    { id:102, name:"Tom", age:32, distance:11, initial:"T" },
    { id:103, name:"Zara", age:29, distance:7, initial:"Z" },
  ];

  const AVATAR_PARAMS = {
    1:   { bg:"#ffe3ec", skin:"#f2c9a4", hair:"#4b2e1d", style:"long",  top:"#d6538c" },
    2:   { bg:"#e6f0ff", skin:"#e3a978", hair:"#1c1c1c", style:"short", top:"#4c6ef5" },
    3:   { bg:"#fff1e0", skin:"#c98a5b", hair:"#14110f", style:"long",  top:"#ff922b" },
    4:   { bg:"#e6f7ef", skin:"#e8b892", hair:"#6b4423", style:"curly", top:"#37b24d" },
    5:   { bg:"#f3e8ff", skin:"#f4d3b0", hair:"#a13d63", style:"bun",   top:"#9b5cff" },
    6:   { bg:"#eef1f3", skin:"#e3a978", hair:"#2b2b2b", style:"beard", top:"#495057" },
    7:   { bg:"#ffe8e8", skin:"#f0c8a0", hair:"#2e1a0f", style:"curly", top:"#ff6b6b" },
    8:   { bg:"#e3fbf3", skin:"#c98a5b", hair:"#17110c", style:"short", top:"#12b886" },
    101: { bg:"#fdeaf3", skin:"#f2c9a4", hair:"#3a2317", style:"long",  top:"#ff8fab" },
    102: { bg:"#eaf1ff", skin:"#e8b892", hair:"#241f1c", style:"short", top:"#5c7cfa" },
    103: { bg:"#f6ecff", skin:"#caa06f", hair:"#171310", style:"curly", top:"#b197fc" },
    female1: { bg:"#ffe3ec", skin:"#f2c9a4", hair:"#26140c", style:"long",  top:"#ff3b6e" },
    male1:   { bg:"#f3e8ff", skin:"#e8b892", hair:"#1c1c1c", style:"short", top:"#9b5cff" },
  };
  // Minutes since last active, mocked to demonstrate the online-now / recently-active / stale /
  // hidden-after-60-days tiers described in the discovery rules.
  const LAST_ACTIVE_MINS = {
    1: 3,             // Aoife — online now
    2: 40,            // Sam
    3: 60 * 5,        // Priya — a few hours ago
    4: 60 * 24 * 20,  // Jordan — 20 days, deprioritised
    5: 15,            // Maeve — online now
    6: 60 * 24 * 70,  // Cian — 70 days, hidden from discovery entirely
    7: 60 * 24 * 2,   // Beth — 2 days ago
    8: 60 * 24 * 16,  // Rio — 16 days, deprioritised
    101: 8, 102: 60 * 24 * 3, 103: 25,
  };
  PROFILES.forEach(p => {
    const a = AVATAR_PARAMS[p.id];
    if(a){ p.photos = personSVGSet(a); p.photoUri = p.photos[0]; }
    p.lastActiveMins = LAST_ACTIVE_MINS[p.id] ?? 0;
  });
  LIKES_RECEIVED.forEach(p => {
    const a = AVATAR_PARAMS[p.id];
    if(a){ p.photos = personSVGSet(a); p.photoUri = p.photos[0]; }
    p.lastActiveMins = LAST_ACTIVE_MINS[p.id] ?? 0;
  });

  const ONLINE_MINS = 10, STALE_DAYS = 14, HIDDEN_DAYS = 60;
  const isOnline = p => p.lastActiveMins <= ONLINE_MINS;
  const isStale = p => p.lastActiveMins > STALE_DAYS * 24 * 60;
  const isHiddenFromDiscovery = p => p.lastActiveMins > HIDDEN_DAYS * 24 * 60;
  function lastSeenLabel(p){
    if(isOnline(p)) return "Online now";
    const mins = p.lastActiveMins;
    if(mins < 60) return `Active ${mins}m ago`;
    if(mins < 60*24) return `Active ${Math.round(mins/60)}h ago`;
    return `Active ${Math.round(mins/(60*24))}d ago`;
  }

  // Real signups (once Supabase is wired up and someone completes real verification) get
  // fetched into here and merged into Discover alongside the curated demo personas, so the
  // deck keeps working exactly the same way whether a profile is a mock or a real account.
  const REAL_PROFILES = [];
  function buildDiscoverDeck(){
    return [...PROFILES, ...REAL_PROFILES]
      .filter(p => !isHiddenFromDiscovery(p))
      .sort((a,b) => (isStale(a)?1:0) - (isStale(b)?1:0));
  }

  /* ---------------- State ---------------- */
  const state = {
    screen: "landing",
    prevScreen: "discover",
    ob: { step:1, totalSteps:6, loc:"live", photos:[null,null,null], reasons:[], username:"", contacts:false, guestUpgradeMode:false },
    guestMode: false,
    guestSwipeCount: 0,
    guestGateTriggered: false,
    realUserId: null,
    swipesUsed: 0,
    swipesLimit: 200,
    deckIndex: 0,
    deck: buildDiscoverDeck(),
    matches: [],
    chats: {},
    activeChatId: null,
    idVerified: false,
    ageVerified: false,
    ext18Mode: "off",
    filters: { distance:50, ageMin:18, ageMax:45, reasons:[], show18:false, verifiedOnly:true, sort:["proximity","age","interests"] },
    myCountry: "IE",
    visibility: "public",
    paused: false,
    notifPrefs: {
      match:   { push:true, email:true,  sms:false },
      message: { push:true, email:false, sms:false },
      like:    { push:true, email:false, sms:false },
      call:    { push:true, email:false, sms:false },
    },
    reportsMade: {},          // targetId -> true, prevents double-counting the same target
    myReportCount: 0,
    myReportTrust: 1,         // weight applied to reports THIS user files; drops if they over-report
    callHistory: [],
    likesReceived: [...LIKES_RECEIVED],
    showOnlineStatus: true,
    callPermission: "list",      // "everyone" | "list" | "nobody"
    approvedCallers: new Set(),  // names allowed to call regardless of callPermission
    callRequestLog: [],
    detailProfile: null,
    detailPhotoIndex: 0,
    detailContext: "deck",       // "deck" | "match" | "like"
    rtc: { peer:null, call:null, localStream:null, roomCode:null, faceTimer:null, noFaceStrikes:0, countdownInterval:null, faceModelReady:false, skipFaceCheck:false, activeCallProfileName:null, activeCallProfileId:null, connected:false, isBlindDate:false, wasVideo:false },
    blindPeer: null,
    blindFiltersUnlocked: false,
  };

  const $ = (sel, root) => (root||document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root||document).querySelectorAll(sel));

  function avatarHtml(profile, extraClass){
    const cls = "avatar" + (extraClass ? " " + extraClass : "");
    const inner = profile.photoUri
      ? `<div class="${cls}" style="background-image:url('${profile.photoUri}')"></div>`
      : `<div class="${cls}">${profile.initial}</div>`;
    if(!state.showOnlineStatus || typeof profile.lastActiveMins !== "number") return inner;
    const dotCls = isOnline(profile) ? "online-dot" : "online-dot online-dot--offline";
    return `<div class="avatar-wrap">${inner}<span class="${dotCls}"></span></div>`;
  }

  function sortProfiles(list, key){
    const arr = [...list];
    if(key === "age") arr.sort((a,b) => a.age - b.age);
    else if(key === "online") arr.sort((a,b) => {
      const ao = isOnline(a) ? 0 : 1, bo = isOnline(b) ? 0 : 1;
      if(ao !== bo) return ao - bo;
      return (a.lastActiveMins ?? 9e9) - (b.lastActiveMins ?? 9e9);
    });
    else if(key === "reason") arr.sort((a,b) => {
      const score = p => (p.reasons || []).filter(r => state.ob.reasons.includes(r)).length;
      return score(b) - score(a);
    });
    else arr.sort((a,b) => (a.distance ?? 0) - (b.distance ?? 0));
    return arr;
  }

  function toast(msg, ms){
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(()=>{ t.hidden = true; }, ms || 2200);
  }

  /* ---------------- Navigation ---------------- */
  function showScreen(name){
    if(name === "landing"){
      $("#appFrame").classList.remove("is-open");
      $$('.screen').forEach(s=>s.classList.remove("is-active"));
      $('.screen--landing').classList.add("is-active");
      state.screen = "landing";
      window.scrollTo(0,0);
      return;
    }
    $('.screen--landing').classList.remove("is-active");
    $("#appFrame").classList.add("is-open");
    $$(".app-frame > .screen").forEach(s=>s.classList.remove("is-active"));
    const target = $(`.app-frame > [data-screen="${name}"]`);
    if(target) target.classList.add("is-active");
    $$(".nav-btn").forEach(b=>b.classList.toggle("is-active", b.dataset.nav === name));
    state.screen = name;
    if(name === "discover") renderDeck();
    if(name === "matches") renderMatches();
    if(name === "profile") renderProfile();
    if(name === "settings") renderSettings();
    if(name === "activity") renderActivity();
    if(name === "safety") renderSafetyScreen();
  }

  document.addEventListener("click", (e)=>{
    const navBtn = e.target.closest("[data-nav]");
    if(navBtn) showScreen(navBtn.dataset.nav);
    if(e.target.closest('[data-action="guestStart"]')) startGuestMode();
  });

  /* ---------------- Guest mode (0-step entry, gated after a taste) ----------------
     New visitors can swipe immediately with no signup. The gate below fires the moment they
     hit 10 swipes OR get a match/like — whichever comes first — same idea Hinge/Bumble-style
     apps use to cut signup friction while still requiring verification before anyone can really
     use the platform (message, be messaged, keep browsing indefinitely). */
  function startGuestMode(){
    state.guestMode = true;
    state.guestSwipeCount = 0;
    state.guestGateTriggered = false;
    if(!state.ob.username) state.ob.username = "Guest";
    showScreen("discover");
  }

  function triggerGuestGate(reason){
    if(!state.guestMode || state.guestGateTriggered) return;
    state.guestGateTriggered = true;
    $("#guestGateText").textContent = reason;
    $("#guestGateOverlay").hidden = false;
  }

  $("#guestGateVerifyBtn").addEventListener("click", ()=>{
    $("#guestGateOverlay").hidden = true;
    state.ob.guestUpgradeMode = true;
    state.ob.step = 1;
    if(state.ob.username === "Guest") state.ob.username = "";
    updateOnboardUI();
    showScreen("onboarding");
  });

  /* ---------------- Onboarding ---------------- */
  // Constrain the date picker itself so nobody can even select an under-18 or nonsense date —
  // far better UX than letting them pick it and then rejecting it.
  (function setDobBounds(){
    const dobInput = $("#obDob");
    const today = new Date();
    const maxDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    dobInput.max = fmt(maxDate);
    dobInput.min = "1930-01-01";
  })();

  const obSteps = () => $$(".ob-step");
  function updateOnboardUI(){
    obSteps().forEach(s => s.classList.toggle("is-active", Number(s.dataset.step) === state.ob.step));
    $("#obProgress").style.width = Math.round((state.ob.step/state.ob.totalSteps)*100) + "%";
    $("#obBack").style.visibility = state.ob.step === 1 ? "hidden" : "visible";
    $("#obNext").textContent = state.ob.step === state.ob.totalSteps ? "Verify & enter Merj" : "Continue";
    if(state.ob.step === 6){
      $("#obEmailConfirm").textContent = $("#obEmail").value || "your address";
      if(state.ob.otpSentForEmail !== $("#obEmail").value) sendRealOtp();
    }
    // Guests upgrading mid-swipe only need identity + verification (steps 1 & 6) to keep going —
    // photos/reasons/extras can be skipped and finished later from the profile screen.
    $("#obSkipRow").hidden = !(state.ob.guestUpgradeMode && state.ob.step > 1 && state.ob.step < 6);
  }
  $("#obSkipBtn").addEventListener("click", ()=>{
    state.ob.step = 6;
    updateOnboardUI();
    saveOnboardingDraft();
  });

  function validateStep(step){
    if(step === 1){
      if(!$("#obUsername").value.trim()) return "Pick a username.";
      if(!/^\S+@\S+\.\S+$/.test($("#obEmail").value)) return "Enter a valid email.";
      if(!$("#obPhone").value.trim()) return "Phone number is required — it's how we verify you.";
      const dob = $("#obDob").value;
      if(!dob) return "Date of birth is required.";
      const age = ageFromDob(dob);
      if(age < 18) return "You must be 18 or older to use Merj.";
    }
    if(step === 2){
      if(state.ob.loc === "fixed" && !$("#obCity").value.trim()) return "Enter a city, or switch to live location.";
    }
    if(step === 3){
      const count = state.ob.photos.filter(Boolean).length;
      if(count < 3) return "Add at least 3 photos to continue.";
    }
    if(step === 4){
      if(state.ob.reasons.length === 0) return "Pick at least one reason so we can match you well.";
    }
    return null;
  }

  function ageFromDob(dobStr){
    const dob = new Date(dobStr);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if(m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age;
  }

  $("#obNext").addEventListener("click", ()=>{
    const err = validateStep(state.ob.step);
    if(err){ toast(err); return; }
    if(state.ob.step < state.ob.totalSteps){
      state.ob.step++;
      updateOnboardUI();
      saveOnboardingDraft();
    } else {
      verifyRealOtpAndFinish();
    }
  });
  $("#obBack").addEventListener("click", ()=>{
    if(state.ob.step > 1){ state.ob.step--; updateOnboardUI(); saveOnboardingDraft(); }
  });

  /* ---------------- Real email verification (Supabase Auth) ----------------
     Phone/SMS verification would need a paid SMS provider (Twilio etc.) configured on top of
     Supabase Auth — a separate account/cost decision, deferred for now. Email OTP is free and
     built in, so that's the real verification channel for Phase 1; the phone field is still
     collected as profile data, just not the verification mechanism yet. */
  function otpBoxes(){ return $$(".otp-box", $("#obOtpRow")); }
  otpBoxes().forEach((box, i)=>{
    box.addEventListener("input", ()=>{
      box.value = box.value.replace(/\D/g, "").slice(0,1);
      if(box.value && otpBoxes()[i+1]) otpBoxes()[i+1].focus();
    });
    box.addEventListener("keydown", (e)=>{
      if(e.key === "Backspace" && !box.value && otpBoxes()[i-1]) otpBoxes()[i-1].focus();
    });
  });

  function sendRealOtp(){
    const email = $("#obEmail").value.trim();
    if(!sb || !email) return;
    state.ob.otpSentForEmail = email;
    $("#obOtpHint").textContent = "Sending your code…";
    sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }).then(({ error })=>{
      $("#obOtpHint").textContent = error
        ? "Couldn't send a code — check the email address, then try Resend."
        : "Enter the 6-digit code we emailed you.";
      if(error) console.error("signInWithOtp error", error);
    });
  }
  $("#obResendOtpBtn").addEventListener("click", ()=>{
    state.ob.otpSentForEmail = null; // force a resend even for the same address
    sendRealOtp();
  });

  function verifyRealOtpAndFinish(){
    if(!sb){
      toast("Backend isn't reachable right now — try again in a moment.");
      return;
    }
    const email = $("#obEmail").value.trim();
    const code = otpBoxes().map(b=>b.value).join("");
    if(code.length < 6){ toast("Enter the full 6-digit code."); return; }
    $("#obNext").disabled = true;
    $("#obNext").textContent = "Verifying…";
    sb.auth.verifyOtp({ email, token: code, type: "email" }).then(({ data, error })=>{
      $("#obNext").disabled = false;
      if(error){
        $("#obNext").textContent = "Verify & enter Merj";
        toast("That code didn't match — check it or tap Resend.");
        return;
      }
      completeOnboarding(data.user.id);
    });
  }

  $$('.choice-card[data-loc]').forEach(card=>{
    card.addEventListener("click", ()=>{
      const group = card.closest(".choice-row");
      $$('.choice-card[data-loc]', group).forEach(c=>c.classList.remove("is-selected"));
      card.classList.add("is-selected");
      const loc = card.dataset.loc;
      const isOnboard = !!card.closest(".ob-step");
      if(isOnboard){
        state.ob.loc = loc;
        $("#fixedLocField").hidden = loc !== "fixed";
        saveOnboardingDraft();
      }
    });
  });

  $("#reasonChips").addEventListener("click", (e)=>{
    const chip = e.target.closest(".chip");
    if(!chip) return;
    chip.classList.toggle("is-selected");
    const r = chip.dataset.reason;
    if(chip.classList.contains("is-selected")) state.ob.reasons.push(r);
    else state.ob.reasons = state.ob.reasons.filter(x=>x!==r);
    saveOnboardingDraft();
  });

  /* ---------------- Onboarding draft persistence ----------------
     Mobile browsers (Android Chrome especially, on lower-RAM phones) can kill a backgrounded
     tab while the user is off in the native camera app taking a signup photo. Without this,
     coming back to a reloaded tab meant losing the entire signup and landing back on the
     marketing page. This snapshots progress after every step/photo/choice so a reload resumes
     instead of restarting. */
  const OB_DRAFT_KEY = "merj_onboarding_draft";
  function saveOnboardingDraft(){
    try{
      sessionStorage.setItem(OB_DRAFT_KEY, JSON.stringify({
        step: state.ob.step, loc: state.ob.loc, photos: state.ob.photos, reasons: state.ob.reasons,
        username: $("#obUsername").value, email: $("#obEmail").value, phone: $("#obPhone").value,
        dob: $("#obDob").value, city: $("#obCity").value, bio: $("#obBio").value,
        social1: $("#obSocial1").value, social2: $("#obSocial2").value, contacts: $("#obContacts").checked,
        guestUpgradeMode: state.ob.guestUpgradeMode, guestMode: state.guestMode,
      }));
    }catch(e){ /* storage full/unavailable — draft just won't survive a reload this time */ }
  }
  function restoreOnboardingDraftIfAny(){
    let raw;
    try{ raw = sessionStorage.getItem(OB_DRAFT_KEY); }catch(e){ return; }
    if(!raw) return;
    let d;
    try{ d = JSON.parse(raw); }catch(e){ return; }
    state.ob.loc = d.loc || "live";
    state.ob.photos = d.photos || [null,null,null];
    state.ob.reasons = d.reasons || [];
    state.ob.step = d.step || 1;
    state.ob.guestUpgradeMode = !!d.guestUpgradeMode;
    state.guestMode = !!d.guestMode;
    $("#obUsername").value = d.username || "";
    $("#obEmail").value = d.email || "";
    $("#obPhone").value = d.phone || "";
    $("#obDob").value = d.dob || "";
    $("#obCity").value = d.city || "";
    $("#obBio").value = d.bio || "";
    $("#obSocial1").value = d.social1 || "";
    $("#obSocial2").value = d.social2 || "";
    $("#obContacts").checked = !!d.contacts;
    $$('.choice-card[data-loc]').forEach(c => c.classList.toggle("is-selected", c.dataset.loc === state.ob.loc));
    $("#fixedLocField").hidden = state.ob.loc !== "fixed";
    $$('#reasonChips .chip').forEach(c => c.classList.toggle("is-selected", state.ob.reasons.includes(c.dataset.reason)));
    buildPhotoGrid();
    updateOnboardUI();
    showScreen("onboarding");
    toast("Welcome back — picked up where you left off.");
  }

  // Photo upload slots (client-side preview only, simulated nudity scan)
  // Downscale + JPEG-compress any photo before it ever touches app state. This keeps memory/
  // storage use sane for real camera photos (which can be 5-10MB+ straight off a phone sensor)
  // and is what makes it possible to persist an in-progress signup draft (see below) without
  // blowing sessionStorage's quota.
  function resizeImageFile(file, maxDim, quality){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if(width > height && width > maxDim){ height = Math.round(height * maxDim / width); width = maxDim; }
          else if(height >= width && height > maxDim){ width = Math.round(width * maxDim / height); height = maxDim; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality || 0.82));
        };
        img.onerror = () => reject(new Error("Couldn't read that image"));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error("Couldn't read that file"));
      reader.readAsDataURL(file);
    });
  }

  function buildPhotoGrid(){
    const grid = $("#photoGrid");
    grid.innerHTML = "";
    for(let i=0;i<3;i++){
      const slot = document.createElement("label");
      const existing = state.ob.photos[i];
      slot.className = "photo-slot" + (existing ? " has-photo" : "");
      slot.innerHTML = existing
        ? `<img src="${existing}" alt="Photo ${i+1}"><input type="file" accept="image/*" data-idx="${i}">`
        : `<span>📷<br>Photo ${i+1}</span><input type="file" accept="image/*" data-idx="${i}">`;
      grid.appendChild(slot);
    }
    const count = state.ob.photos.filter(Boolean).length;
    $("#photoCount").textContent = `${count} of 3 minimum added`;
  }

  function onPhotoSelected(e){
    const input = e.target.closest('input[type=file]');
    if(!input || !input.files[0]) return;
    const idx = Number(input.dataset.idx);
    const slot = input.closest(".photo-slot");
    slot.innerHTML = `<span>Processing…</span>`;
    resizeImageFile(input.files[0], 900, 0.82).then(dataUrl=>{
      state.ob.photos[idx] = dataUrl;
      slot.className = "photo-slot has-photo";
      slot.innerHTML = `<img src="${dataUrl}" alt="Photo ${idx+1}"><span class="scan-badge">Scanning…</span><input type="file" accept="image/*" data-idx="${idx}">`;
      setTimeout(()=>{
        const badge = slot.querySelector(".scan-badge");
        if(badge) badge.textContent = "✓ Passed nudity check";
      }, 700);
      const count = state.ob.photos.filter(Boolean).length;
      $("#photoCount").textContent = `${count} of 3 minimum added`;
      saveOnboardingDraft();
    }).catch(()=>{
      toast("Couldn't process that photo — try again.");
      slot.className = "photo-slot";
      slot.innerHTML = `<span>📷<br>Photo ${idx+1}</span><input type="file" accept="image/*" data-idx="${idx}">`;
    });
  }

  // Converts a data: URL (already resized/compressed by resizeImageFile) into a Blob for upload.
  function dataUrlToBlob(dataUrl){
    return fetch(dataUrl).then(r => r.blob());
  }

  function uploadPhotosToStorage(userId, dataUrls){
    const uploads = dataUrls.filter(Boolean).map((dataUrl, i)=>
      dataUrlToBlob(dataUrl).then(blob=>
        sb.storage.from("profile-photos").upload(`${userId}/photo${i}-${Date.now()}.jpg`, blob, { contentType: "image/jpeg", upsert: true })
          .then(({ data, error })=>{
            if(error){ console.error("photo upload error", error); return null; }
            return sb.storage.from("profile-photos").getPublicUrl(data.path).data.publicUrl;
          })
      )
    );
    return Promise.all(uploads).then(urls => urls.filter(Boolean));
  }

  function completeOnboarding(realUserId){
    state.ob.username = $("#obUsername").value.trim();
    state.ob.bio = $("#obBio").value.trim();
    state.ob.social1 = $("#obSocial1").value.trim();
    state.ob.social2 = $("#obSocial2").value.trim();
    state.ob.contacts = $("#obContacts").checked;
    try{ sessionStorage.removeItem(OB_DRAFT_KEY); }catch(e){}
    const wasGuestUpgrade = state.ob.guestUpgradeMode;
    state.ob.guestUpgradeMode = false;

    function finish(){
      if(wasGuestUpgrade){
        state.guestMode = false;
        toast(`Verified — welcome to Merj, ${state.ob.username}!`);
        showScreen("discover");
        if(state.ob.photos.filter(Boolean).length < 3){
          setTimeout(()=> toast("Add 3 photos from your profile so others can see you in Discover."), 2500);
        }
      } else {
        toast(`Welcome to Merj, ${state.ob.username}!`);
        showScreen("discover");
      }
    }

    if(!sb || !realUserId){ finish(); return; }

    state.realUserId = realUserId;
    const rawPhotos = state.ob.photos.filter(Boolean);
    const photoUpload = rawPhotos.length ? uploadPhotosToStorage(realUserId, rawPhotos) : Promise.resolve([]);

    photoUpload.then(photoUrls=>{
      return sb.from("profiles").upsert({
        id: realUserId,
        username: state.ob.username,
        age: ageFromDob($("#obDob").value),
        dob: $("#obDob").value,
        bio: state.ob.bio,
        reasons: state.ob.reasons,
        photos: photoUrls,
        location_mode: state.ob.loc,
        city: $("#obCity").value.trim() || null,
        phone_verified: false,
        email_verified: true,
      });
    }).then(({ error })=>{
      if(error){
        console.error("profile upsert error", error);
        toast("Verified, but saving your profile to the backend failed — you can keep going locally for now.");
      } else {
        toast("Your profile is saved to the real backend.");
        loadRealProfiles();
      }
      finish();
    }).catch(err=>{
      console.error(err);
      toast("Verified, but the backend save failed — check the schema has been run.");
      finish();
    });
  }

  // Pulls real signed-up profiles into Discover alongside the curated demo personas. Falls back
  // silently (deck just stays mock-only) if the schema hasn't been run yet or the fetch fails.
  function loadRealProfiles(){
    if(!sb) return;
    sb.from("profiles").select("*").eq("is_banned", false).then(({ data, error })=>{
      if(error || !data) return;
      REAL_PROFILES.length = 0;
      data.forEach(row=>{
        if(row.id === state.realUserId) return; // never show yourself in your own deck
        REAL_PROFILES.push({
          id: "real-" + row.id,
          name: row.username,
          age: row.age || 25,
          distance: Math.floor(1 + Math.random()*20),
          initial: (row.username || "?")[0].toUpperCase(),
          verified: !!row.phone_verified,
          reasons: row.reasons || [],
          bio: row.bio || "",
          has18: row.ext18_mode && row.ext18_mode !== "off",
          ext18Mode: row.ext18_mode,
          interests: row.interests || [],
          photos: (row.photos && row.photos.length) ? row.photos : undefined,
          photoUri: (row.photos && row.photos.length) ? row.photos[0] : personSVG({ bg:"#eef1f3", skin:"#e3a978", hair:"#2b2b2b", style:"short", top:"#495057" }),
          lastActiveMins: row.last_active_at ? Math.max(0, Math.round((Date.now() - new Date(row.last_active_at).getTime())/60000)) : 0,
          declaredCountry: row.declared_country, ipCountry: row.declared_country, phoneCountry: row.declared_country,
          aiPhotoSuspected: false, duplicateImageFlag: false, accountAgeDays: 1, likeRatio: 0.3,
        });
      });
      state.deck = buildDiscoverDeck();
      if(state.screen === "discover") renderDeck();
    }).catch(()=>{ /* backend unreachable — Discover just stays mock-only */ });
  }

  /* ---------------- Demo stakeholder logins ----------------
     Two hardcoded accounts so stakeholders can see a populated profile/matches/chat instantly
     without running through full signup. Not real auth — just a prototype convenience. */
  const DEMO_ACCOUNTS = {
    female1: {
      password: "femtest",
      username: "Ciara Doyle",
      bio: "Sea swims, bad puns, and an unreasonable number of houseplants.",
      reasons: ["Dinner dates", "Long term"],
      ageVerified: true,
      idVerified: false,
      seedMatchId: 4, // Jordan
    },
    male1: {
      password: "maletest",
      username: "Darragh Kelly",
      bio: "Five-a-side on Tuesdays, terrible at cooking, great at ordering takeaway.",
      reasons: ["No strings fun", "Video chat fun"],
      ageVerified: false,
      idVerified: true,
      seedMatchId: 1, // Aoife
    },
  };

  function seedDemoMatch(matchProfile, greeting){
    if(!matchProfile || state.matches.find(m=>m.id===matchProfile.id)) return;
    state.matches.unshift(matchProfile);
    state.chats[matchProfile.id] = [{ from:"them", text: greeting }];
  }

  $("#loginBtn").addEventListener("click", ()=>{
    const u = $("#loginUsername").value.trim().toLowerCase();
    const p = $("#loginPassword").value;
    const account = DEMO_ACCOUNTS[u];
    if(!account || account.password !== p){
      toast("Invalid demo login. Try female1/femtest or male1/maletest.");
      return;
    }
    const photoUri = personSVG(AVATAR_PARAMS[u]);
    state.ob.username = account.username;
    state.ob.bio = account.bio;
    state.ob.reasons = [...account.reasons];
    state.ob.photos = [photoUri, photoUri, photoUri];
    state.ob.photoUri = photoUri;
    state.ob.loc = "fixed";
    state.ob.social1 = "";
    state.ob.social2 = "";
    state.ageVerified = account.ageVerified;
    state.idVerified = account.idVerified;
    seedDemoMatch(PROFILES.find(p=>p.id===account.seedMatchId), `Hey ${account.username.split(" ")[0]}! Great to match with you 🎉`);
    toast(`Logged in as ${account.username} (demo account).`);
    showScreen("discover");
  });

  /* ---------------- Discover / swipe deck ---------------- */
  function renderDeck(){
    const area = $("#deckArea");
    $$(".swipe-card", area).forEach(c=>c.remove());
    $("#deckEmpty").hidden = true;
    $("#deckOut").hidden = true;
    updateSwipeMeter();

    if(state.swipesUsed >= state.swipesLimit){
      $("#deckOut").hidden = false;
      return;
    }
    const remaining = state.deck.slice(state.deckIndex, state.deckIndex + 3).reverse();
    if(remaining.length === 0){
      $("#deckEmpty").hidden = false;
      return;
    }
    // Append farthest-back card first so the current top-of-stack card (state.deck[deckIndex])
    // ends up LAST in DOM order — which is what paints on top AND what ":last-child" matches,
    // so it's both the visible card and the one drag/tap handlers act on.
    remaining.forEach(profile => area.appendChild(buildCard(profile)));
    updateSwipeMeter();
  }

  function buildCard(profile){
    const card = document.createElement("div");
    card.className = "swipe-card";
    card.dataset.id = profile.id;
    card.dataset.photoIndex = "0";
    const lockBadge = profile.has18
      ? `<div class="lock-badge">🔒 18+ ${profile.ext18Mode === "open" ? "unlocked" : "extension"}</div>` : "";
    const photos = profile.photos && profile.photos.length ? profile.photos : (profile.photoUri ? [profile.photoUri] : []);
    const photoStyle = photos.length ? ` style="background-image:url('${photos[0]}')"` : "";
    const dots = photos.length > 1
      ? `<div class="photo-dots">${photos.map((_,i)=>`<span class="${i===0?"is-active":""}"></span>`).join("")}</div>
         <div class="photo-tap-zone photo-tap-zone--prev"></div>
         <div class="photo-tap-zone photo-tap-zone--next"></div>`
      : "";
    const statusBadge = (state.showOnlineStatus && typeof profile.lastActiveMins === "number")
      ? `<div class="card-status${isOnline(profile) ? "" : " is-offline"}"><span class="dot"></span>${lastSeenLabel(profile)}</div>`
      : "";
    card.innerHTML = `
      <div class="stamp stamp--like">LIKE</div>
      <div class="stamp stamp--pass">PASS</div>
      <div class="card-photo"${photoStyle}>${photos.length ? "" : profile.initial}${dots}${statusBadge}${lockBadge}</div>
      <div class="card-body">
        <div class="card-name-row"><h3>${profile.name}, ${profile.age}</h3><span class="distance">${profile.distance} km</span></div>
        <div class="card-tags">${profile.reasons.map(r=>`<span class="tag">${r}</span>`).join("")}</div>
        <p class="card-bio">${profile.bio}</p>
        ${profile.verified ? '<div class="card-verified">✓ Phone verified</div>' : ''}
      </div>`;
    if(photos.length > 1) wirePhotoCarousel(card, photos);
    attachDrag(card, profile);
    return card;
  }

  function wirePhotoCarousel(card, photos){
    const photoEl = card.querySelector(".card-photo");
    const dots = card.querySelectorAll(".photo-dots span");
    function show(idx){
      card.dataset.photoIndex = String(idx);
      photoEl.style.backgroundImage = `url('${photos[idx]}')`;
      dots.forEach((d,i)=> d.classList.toggle("is-active", i===idx));
    }
    card.querySelector(".photo-tap-zone--prev").addEventListener("click", (e)=>{
      e.stopPropagation();
      const idx = (Number(card.dataset.photoIndex) - 1 + photos.length) % photos.length;
      show(idx);
    });
    card.querySelector(".photo-tap-zone--next").addEventListener("click", (e)=>{
      e.stopPropagation();
      const idx = (Number(card.dataset.photoIndex) + 1) % photos.length;
      show(idx);
    });
  }

  function attachDrag(card, profile){
    let startX=0, startY=0, dx=0, dy=0, dragging=false;
    const likeStamp = () => card.querySelector(".stamp--like");
    const passStamp = () => card.querySelector(".stamp--pass");

    function onDown(x,y){
      if(card !== $(".swipe-card:last-child")) return;
      dragging = true; startX = x; startY = y;
      card.style.transition = "none";
    }
    function onMove(x,y){
      if(!dragging) return;
      dx = x - startX; dy = y - startY;
      const rot = dx / 14;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
      const opac = Math.min(Math.abs(dx)/100, 1);
      if(dx > 0){ likeStamp().style.opacity = opac; passStamp().style.opacity = 0; }
      else { passStamp().style.opacity = opac; likeStamp().style.opacity = 0; }
    }
    function onUp(){
      if(!dragging) return;
      dragging = false;
      card.style.transition = "transform .3s ease";
      if(dx > 110) resolveSwipe(profile, "like", card);
      else if(dx < -110) resolveSwipe(profile, "pass", card);
      else { card.style.transform = ""; likeStamp().style.opacity=0; passStamp().style.opacity=0; }
    }
    card.addEventListener("pointerdown", e=>{ card.setPointerCapture(e.pointerId); onDown(e.clientX, e.clientY); });
    card.addEventListener("pointermove", e=> onMove(e.clientX, e.clientY));
    card.addEventListener("pointerup", onUp);
    card.addEventListener("pointercancel", onUp);
  }

  function resolveSwipe(profile, action, card){
    if(state.swipesUsed >= state.swipesLimit) return;
    state.swipesUsed++;
    state.deckIndex++;
    const flyX = action === "like" ? 600 : -600;
    if(card){
      card.style.transform = `translate(${flyX}px, -40px) rotate(${flyX/14}deg)`;
      card.style.opacity = "0";
    }
    if(action === "like"){
      const isMatch = Math.random() < 0.45;
      if(isMatch) createMatch(profile);
    }
    maybeDripNewLike();
    if(state.guestMode){
      state.guestSwipeCount++;
      if(state.guestSwipeCount >= 10) triggerGuestGate("You've hit 10 free swipes as a guest. Verify your phone or email to keep going.");
    }
    setTimeout(()=>{ renderDeck(); }, 220);
    updateSwipeMeter();
  }

  // Simulates likes arriving from other users over time, with an on-screen alert — demonstrates
  // the "notify as it happens" behaviour a real backend would push via websocket/notification.
  const LIKE_DRIP_POOL = [
    { id:104, name:"Sinead", age:27, distance:6, initial:"S" },
    { id:105, name:"Liam", age:29, distance:9, initial:"L" },
  ];
  AVATAR_PARAMS[104] = { bg:"#eafff5", skin:"#e8b892", hair:"#2c1c12", style:"curly", top:"#0ca678" };
  AVATAR_PARAMS[105] = { bg:"#fff5e6", skin:"#f0c8a0", hair:"#141110", style:"short", top:"#f08c00" };
  LIKE_DRIP_POOL.forEach(p => { p.photos = personSVGSet(AVATAR_PARAMS[p.id]); p.photoUri = p.photos[0]; p.lastActiveMins = 2; });

  function maybeDripNewLike(){
    if(state.swipesUsed % 4 !== 0 || LIKE_DRIP_POOL.length === 0) return;
    const liker = LIKE_DRIP_POOL.shift();
    state.likesReceived.unshift(liker);
    toast(`💗 ${liker.name} likes you! Check Activity to say hi.`);
    if(state.screen === "activity") renderActivity();
    if(state.guestMode) triggerGuestGate("Someone likes you! Verify your phone or email to see who and match back.");
  }

  $("#passBtn").addEventListener("click", ()=>{
    const top = $(".swipe-card:last-child");
    const profile = state.deck[state.deckIndex];
    if(!profile) return;
    resolveSwipe(profile, "pass", top);
  });
  $("#likeBtn").addEventListener("click", ()=>{
    const top = $(".swipe-card:last-child");
    const profile = state.deck[state.deckIndex];
    if(!profile) return;
    resolveSwipe(profile, "like", top);
  });
  $("#infoBtn").addEventListener("click", ()=>{
    const profile = state.deck[state.deckIndex];
    if(!profile) return;
    openProfileDetail(profile, "deck");
  });

  function updateSwipeMeter(){
    const left = Math.max(state.swipesLimit - state.swipesUsed, 0);
    $("#swipeFill").style.width = (left / state.swipesLimit * 100) + "%";
    $("#swipeCount").textContent = `${left} / ${state.swipesLimit} swipes left today`;
  }

  // Rewarded-ad flow. This is the ONE ad surface in the app on purpose — opt-in, user-triggered,
  // clearly telegraphed reward. Real integration point: replace the setInterval countdown below
  // with a real rewarded-ad SDK call (e.g. Google Ad Manager's rewarded web ad unit, or AdMob
  // rewarded ads for the eventual native app) and call grantAdReward() from its "reward earned"
  // callback instead of the timer. Signing up for/getting approved by an ad network is an account
  // step only you can do — this just leaves the exact spot to plug it in.
  let pendingAdReward = null;
  function playRewardedAd(claimLabel, onComplete){
    pendingAdReward = onComplete;
    $("#adOverlay").hidden = false;
    $("#adCloseBtn").disabled = true;
    $("#adCopy").textContent = "Playing a short ad…";
    let secs = 6;
    $("#adCloseBtn").innerHTML = `Watching… <span id="adCountdown">${secs}</span>s`;
    $("#adProgressFill").style.width = "0%";
    requestAnimationFrame(()=> $("#adProgressFill").style.width = "100%");
    const timer = setInterval(()=>{
      secs--;
      if(secs <= 0){
        clearInterval(timer);
        $("#adCloseBtn").disabled = false;
        $("#adCloseBtn").innerHTML = claimLabel || "Claim reward";
        $("#adCopy").textContent = "Reward earned — tap to close.";
      } else {
        $("#adCountdown").textContent = secs;
      }
    }, 1000);
  }
  $("#watchAdBtn").addEventListener("click", ()=> playRewardedAd("Claim +10 swipes", ()=>{
    state.swipesLimit += 10;
    toast("+10 swipes unlocked!");
    renderDeck();
  }));
  $("#adCloseBtn").addEventListener("click", ()=>{
    if($("#adCloseBtn").disabled) return;
    $("#adOverlay").hidden = true;
    if(pendingAdReward) pendingAdReward();
    pendingAdReward = null;
  });

  /* ---------------- Matching + chat ---------------- */
  function createMatch(profile){
    if(state.matches.find(m=>m.id===profile.id)) return;
    state.matches.unshift(profile);
    state.chats[profile.id] = [
      { from:"them", text:`Hey ${state.ob.username || "there"}! We matched 🎉` , system:false}
    ];
    const meEl = $("#matchAvatarMe");
    if(state.ob.photoUri){ meEl.style.backgroundImage = `url('${state.ob.photoUri}')`; meEl.textContent = ""; }
    else { meEl.style.backgroundImage = ""; meEl.textContent = (state.ob.username||"Y")[0].toUpperCase(); }
    const themEl = $("#matchAvatarThem");
    if(profile.photoUri){ themEl.style.backgroundImage = `url('${profile.photoUri}')`; themEl.textContent = ""; }
    else { themEl.style.backgroundImage = ""; themEl.textContent = profile.initial; }
    $("#matchText").textContent = `You and ${profile.name} both said yes.`;
    $("#matchOverlay").hidden = false;
    $("#matchOverlay")._profileId = profile.id;
    const badge = $("#matchBadge");
    badge.hidden = false; badge.textContent = state.matches.length;
    if(state.guestMode) state.pendingGuestGate = "You've got a match! Verify your phone or email to start chatting.";
  }
  $("#matchDismissBtn").addEventListener("click", ()=>{
    $("#matchOverlay").hidden = true;
    if(state.pendingGuestGate){ triggerGuestGate(state.pendingGuestGate); state.pendingGuestGate = null; }
  });
  $("#matchChatBtn").addEventListener("click", ()=>{
    const id = $("#matchOverlay")._profileId;
    $("#matchOverlay").hidden = true;
    if(state.pendingGuestGate){ const reason = state.pendingGuestGate; state.pendingGuestGate = null; triggerGuestGate(reason); return; }
    openChat(id);
  });

  function renderMatches(){
    const list = $("#matchesList");
    $$(".match-row", list).forEach(r=>r.remove());
    $("#matchesEmpty").hidden = state.matches.length > 0;
    const sorted = sortProfiles(state.matches, $("#mainMatchesSort")?.value || "proximity");
    sorted.forEach(profile=>{
      const chat = state.chats[profile.id] || [];
      const last = chat[chat.length-1];
      const row = document.createElement("div");
      row.className = "match-row" + (chat.length<=1 ? " is-new" : "");
      row.innerHTML = `${avatarHtml(profile)}
        <div><strong>${profile.name}</strong><p class="last-msg">${last ? (last.from==="me"?"You: ":"") + last.text : "Say hi!"}</p></div>
        <div class="match-meta">${profile.distance} km</div>
        <button class="icon-btn" style="width:32px;height:32px;font-size:14px;" data-msg aria-label="Message">💬</button>
        <button class="icon-btn" style="width:32px;height:32px;font-size:12px;" data-unmatch aria-label="Unmatch">✕</button>`;
      row.querySelector("[data-msg]").addEventListener("click", e=>{ e.stopPropagation(); openChat(profile.id); });
      row.querySelector("[data-unmatch]").addEventListener("click", e=>{ e.stopPropagation(); unmatchProfile(profile.id); });
      row.addEventListener("click", ()=> openProfileDetail(profile, "match"));
      list.appendChild(row);
    });
  }

  function unmatchProfile(id){
    const profile = state.matches.find(m=>m.id===id);
    if(!profile) return;
    state.matches = state.matches.filter(m=>m.id!==id);
    delete state.chats[id];
    toast(`Unmatched from ${profile.name}.`);
    renderMatches();
    if(state.screen === "activity") renderActivity();
  }

  function openChat(id){
    state.activeChatId = id;
    const profile = state.matches.find(m=>m.id===id);
    if(!profile) return;
    $("#chatWithName").textContent = profile.name;
    renderChatThread();
    showScreen("chat");
  }

  function renderChatThread(){
    const thread = $("#chatThread");
    thread.innerHTML = "";
    const msgs = state.chats[state.activeChatId] || [];
    msgs.forEach(m=>{
      const div = document.createElement("div");
      div.className = "msg " + (m.system ? "msg--system" : (m.from === "me" ? "msg--me" : "msg--them"));
      div.textContent = m.text;
      thread.appendChild(div);
    });
    thread.scrollTop = thread.scrollHeight;
  }

  $("#chatSend").addEventListener("click", sendChat);
  $("#chatInput").addEventListener("keydown", e=>{ if(e.key === "Enter") sendChat(); });
  function sendChat(){
    const input = $("#chatInput");
    const text = input.value.trim();
    if(!text || !state.activeChatId) return;
    state.chats[state.activeChatId].push({from:"me", text});
    input.value = "";
    renderChatThread();
    renderMatches();
    setTimeout(()=>{
      const profile = state.matches.find(m=>m.id===state.activeChatId);
      const replies = ["Haha fair enough.","Tell me more!","I was just thinking the same thing.","😄 love that.","What are you up to this weekend?"];
      state.chats[state.activeChatId].push({from:"them", text: replies[Math.floor(Math.random()*replies.length)]});
      if(state.activeChatId === profile.id) renderChatThread();
      renderMatches();
    }, 900 + Math.random()*900);
  }

  /* ---------------- Real WebRTC calling ---------------- */
  // Signalling uses PeerJS's free public broker (no server of ours). In production, matched
  // users' peer IDs would be exchanged automatically over our own backend the instant both tap
  // "call" — here, since there is no backend, one side shares a room code (or the "open other
  // side" test link) to simulate that handshake while still using genuine WebRTC media underneath.
  function randomRoomCode(){ return "merj-" + Math.random().toString(36).slice(2, 8); }

  function ensurePeer(){
    if(state.rtc.peer && !state.rtc.peer.destroyed) return Promise.resolve(state.rtc.peer);
    return new Promise((resolve, reject)=>{
      if(typeof Peer === "undefined"){ reject(new Error("PeerJS failed to load (no internet?)")); return; }
      const peer = new Peer(randomRoomCode());
      peer.on("open", ()=> resolve(peer));
      peer.on("error", (err)=> { console.error("Peer error", err); toast("Call connection error: " + err.type); });
      peer.on("call", (incomingCall)=>{
        const wantVideo = incomingCall.metadata && incomingCall.metadata.video;
        const callerName = (incomingCall.metadata && incomingCall.metadata.callerName) || "Unknown caller";
        if(!shouldAcceptCall(callerName)){
          incomingCall.close();
          logBlockedCall(callerName, wantVideo ? "video" : "audio", incomingCall.peer);
          return;
        }
        navigator.mediaDevices.getUserMedia({ audio:true, video: !!wantVideo }).then(stream=>{
          state.rtc.localStream = stream;
          state.rtc.activeCallProfileName = callerName;
          state.rtc.wasVideo = !!wantVideo;
          $("#localVideo").srcObject = stream;
          incomingCall.answer(stream);
          wireCall(incomingCall, wantVideo);
          openCallOverlay(wantVideo, "Incoming call");
          $("#callRoomBox").hidden = true;
        }).catch(()=> toast("Camera/mic permission is needed to answer."));
      });
      state.rtc.peer = peer;
    });
  }

  function wireCall(call, isVideo){
    state.rtc.call = call;
    call.on("stream", remoteStream=>{
      $("#remoteVideo").srcObject = remoteStream;
      $("#callRoomBox").hidden = true;
      $("#callTitle").textContent = "Connected";
      state.rtc.connected = true;
      state.rtc.wasVideo = isVideo;
      if(isVideo && !state.rtc.skipFaceCheck) startFaceCheck();
    });
    call.on("close", ()=> endCall(false));
  }

  function openCallOverlay(isVideo, title){
    $("#videoStage").style.display = isVideo ? "block" : "none";
    $("#callTitle").textContent = title;
    $("#faceWarning").hidden = true;
    state.rtc.noFaceStrikes = 0;
    $("#callOverlay").hidden = false;
  }

  function startCall(kind){
    const profile = state.matches.find(m=>m.id===state.activeChatId);
    if(!profile) return;
    const isVideo = kind === "video";
    state.rtc.activeCallProfileName = profile.name;
    state.rtc.activeCallProfileId = profile.id;
    state.rtc.connected = false;
    state.rtc.wasVideo = isVideo;
    state.rtc.skipFaceCheck = !!(profile.has18 && state.ageVerified); // consensual 18+ pairing: face-required check doesn't apply
    state.rtc.isBlindDate = false;
    openCallOverlay(isVideo, `${isVideo ? "Video" : "Audio"} calling ${profile.name}…`);
    $("#callRoomBox").hidden = false;
    $("#roomCodeDisplay").value = "generating…";
    $("#callReportBtn").hidden = true;
    $("#callFootnote").hidden = false;

    navigator.mediaDevices.getUserMedia({ audio:true, video:isVideo })
      .then(stream=>{
        state.rtc.localStream = stream;
        $("#localVideo").srcObject = stream;
        $("#localVideo").style.display = isVideo ? "block" : "none";
        return ensurePeer();
      })
      .then(peer=>{
        $("#roomCodeDisplay").value = peer.id;
        state.rtc.roomCode = peer.id;
      })
      .catch(err=>{
        toast("Couldn't start the call: " + err.message);
        $("#callOverlay").hidden = true;
      });
  }

  function joinRoom(code){
    if(!code) { toast("Enter a room code first."); return; }
    const isVideo = $("#videoStage").style.display !== "none";
    state.rtc.activeCallProfileId = null; // ad-hoc connection, not tied to a known profile
    navigator.mediaDevices.getUserMedia({ audio:true, video:isVideo })
      .then(stream=>{
        state.rtc.localStream = stream;
        $("#localVideo").srcObject = stream;
        return ensurePeer();
      })
      .then(peer=>{
        const call = peer.call(code.trim(), state.rtc.localStream, { metadata:{ video:isVideo, callerName: state.ob.username || "Someone" } });
        wireCall(call, isVideo);
        $("#callTitle").textContent = "Connecting…";
      })
      .catch(err=> toast("Couldn't connect: " + err.message));
  }

  function endCall(logHistory){
    if(state.rtc.call) state.rtc.call.close();
    if(state.rtc.localStream) state.rtc.localStream.getTracks().forEach(t=>t.stop());
    if(state.blindPeer){ state.blindPeer.destroy(); state.blindPeer = null; }
    stopFaceCheck();
    state.rtc.call = null;
    state.rtc.localStream = null;
    $("#remoteVideo").srcObject = null;
    $("#localVideo").srcObject = null;
    $("#callOverlay").hidden = true;
    $("#callReportBtn").hidden = true;
    $("#callFootnote").hidden = false;
    const wasConnected = state.rtc.connected;
    const wasBlindDate = state.rtc.isBlindDate;
    if(logHistory !== false){
      const isVideo = $("#videoStage").style.display !== "none";
      state.callHistory.unshift({
        name: state.rtc.activeCallProfileName || "Unknown",
        kind: isVideo ? "video" : "audio",
        at: new Date(),
        durationSec: Math.floor(10 + Math.random()*180),
      });
      if(state.screen === "activity") renderActivity();
    }
    if(wasConnected && !wasBlindDate) maybeShowVerifyPrompt();
    state.rtc.connected = false;
    state.rtc.isBlindDate = false;
    resetBlindDateUI();
  }

  /* ---------------- Blind Date ----------------
     Real peer-to-peer stranger matching using a single well-known PeerJS ID as a one-slot
     "lobby": whoever claims it first waits; the next visitor who tries instead calls that ID
     directly. This genuinely pairs two concurrent real visitors on the live site — it just
     can't apply the filters below to a pool, because there is no pool without a real
     matchmaking backend holding a live queue. That's the honest limit of a static site. */
  const BLIND_LOBBY_ID = "merj-blind-lobby-v1";
  let blindSearchTimeout = null;

  function updateBlindRangeLabels(){
    $("#blindDistanceVal").textContent = $("#blindRangeDistance").value;
    $("#blindAgeMinVal").textContent = $("#blindRangeAgeMin").value;
    $("#blindAgeMaxVal").textContent = $("#blindRangeAgeMax").value;
  }
  $("#blindRangeDistance").addEventListener("input", updateBlindRangeLabels);
  $("#blindRangeAgeMin").addEventListener("input", e=>{
    if(Number(e.target.value) > Number($("#blindRangeAgeMax").value)) e.target.value = $("#blindRangeAgeMax").value;
    updateBlindRangeLabels();
  });
  $("#blindRangeAgeMax").addEventListener("input", e=>{
    if(Number(e.target.value) < Number($("#blindRangeAgeMin").value)) e.target.value = $("#blindRangeAgeMin").value;
    updateBlindRangeLabels();
  });
  $("#blindShowMeChips").addEventListener("click", e=>{
    const chip = e.target.closest(".chip");
    if(!chip) return;
    $$(".chip", $("#blindShowMeChips")).forEach(c=>c.classList.remove("is-selected"));
    chip.classList.add("is-selected");
  });

  $("#blindUnlockFiltersBtn").addEventListener("click", ()=>{
    playRewardedAd("Unlock filters", ()=>{
      state.blindFiltersUnlocked = true;
      $("#blindFilterLockBadge").textContent = "✓ Unlocked";
      $("#blindFilterUnlockCopy").hidden = true;
      $("#blindUnlockFiltersBtn").hidden = true;
      $("#blindFilterControls").hidden = false;
      toast("Filters unlocked for this session.");
    });
  });

  function resetBlindDateUI(){
    $("#blindStartSection").hidden = false;
    $("#blindSearching").hidden = true;
  }

  function cancelBlindSearch(){
    clearTimeout(blindSearchTimeout);
    if(state.blindPeer){ state.blindPeer.destroy(); state.blindPeer = null; }
    if(state.rtc.localStream){ state.rtc.localStream.getTracks().forEach(t=>t.stop()); state.rtc.localStream = null; }
    resetBlindDateUI();
  }

  function startBlindDate(kind){
    const isVideo = kind === "video";
    $("#blindStartSection").hidden = true;
    $("#blindSearching").hidden = false;
    $("#blindSearchStatus").textContent = "Connecting…";

    navigator.mediaDevices.getUserMedia({ audio:true, video:isVideo }).then(stream=>{
      state.rtc.localStream = stream;
      state.rtc.activeCallProfileName = "A stranger";
      state.rtc.activeCallProfileId = null;
      state.rtc.wasVideo = isVideo;
      state.rtc.skipFaceCheck = false; // anonymous strangers always get the face-presence check
      state.rtc.connected = false;
      state.rtc.isBlindDate = true;

      function onConnected(call){
        clearTimeout(blindSearchTimeout);
        $("#localVideo").srcObject = stream;
        wireCall(call, isVideo);
        openCallOverlay(isVideo, "Connecting…");
        $("#callRoomBox").hidden = true;
        $("#callFootnote").hidden = true;
        $("#callReportBtn").hidden = false;
        showScreen("discover");
        resetBlindDateUI();
      }

      const waiter = new Peer(BLIND_LOBBY_ID);
      state.blindPeer = waiter;
      waiter.on("open", ()=>{
        $("#blindSearchStatus").textContent = "Waiting for another guest to start a blind date… (up to 30s)";
        blindSearchTimeout = setTimeout(()=>{
          toast("No one showed up this time — try again, or open a second tab to test it solo.");
          cancelBlindSearch();
        }, 30000);
      });
      waiter.on("call", incomingCall=>{
        incomingCall.answer(stream);
        onConnected(incomingCall);
      });
      waiter.on("error", err=>{
        if(err.type !== "unavailable-id"){
          toast("Blind date connection error: " + err.type);
          cancelBlindSearch();
          return;
        }
        // Someone's already waiting in the lobby — call them directly instead of waiting ourselves.
        waiter.destroy();
        const caller = new Peer();
        state.blindPeer = caller;
        caller.on("open", ()=>{
          const call = caller.call(BLIND_LOBBY_ID, stream, { metadata:{ video:isVideo, callerName:"A stranger" } });
          onConnected(call);
        });
        caller.on("error", e2=>{ toast("Blind date connection error: " + e2.type); cancelBlindSearch(); });
      });
    }).catch(()=>{
      toast("Camera/mic permission is needed for a blind date.");
      resetBlindDateUI();
    });
  }

  $("#blindStartAudioBtn").addEventListener("click", ()=> startBlindDate("audio"));
  $("#blindStartVideoBtn").addEventListener("click", ()=> startBlindDate("video"));
  $("#blindCancelBtn").addEventListener("click", cancelBlindSearch);
  $("#blindOpenOtherTabBtn").addEventListener("click", ()=>{
    window.open(location.origin + location.pathname, "_blank");
  });
  $("#callReportBtn").addEventListener("click", ()=>{
    toast("Stranger reported and call ended. Thanks for helping keep Merj safe.");
    endCall(false);
  });

  $("#audioCallBtn").addEventListener("click", ()=> startCall("audio"));
  $("#videoCallBtn").addEventListener("click", ()=> startCall("video"));
  $("#callEndBtn").addEventListener("click", ()=> endCall(true));
  $("#copyRoomBtn").addEventListener("click", ()=>{
    const code = $("#roomCodeDisplay").value;
    if(navigator.clipboard) navigator.clipboard.writeText(code).then(()=> toast("Room code copied."));
  });
  $("#openOtherSideBtn").addEventListener("click", ()=>{
    const code = $("#roomCodeDisplay").value;
    if(!code || code === "generating…"){ toast("Wait for your room code to generate first."); return; }
    window.open(location.origin + location.pathname + "?joinRoom=" + encodeURIComponent(code), "_blank");
  });
  $("#joinRoomBtn").addEventListener("click", ()=> joinRoom($("#joinCodeInput").value));
  $("#muteBtn").addEventListener("click", (e)=>{
    if(!state.rtc.localStream) return;
    const track = state.rtc.localStream.getAudioTracks()[0];
    if(!track) return;
    track.enabled = !track.enabled;
    e.target.style.opacity = track.enabled ? "1" : "0.4";
  });
  $("#camToggleBtn").addEventListener("click", (e)=>{
    if(!state.rtc.localStream) return;
    const track = state.rtc.localStream.getVideoTracks()[0];
    if(!track) return;
    track.enabled = !track.enabled;
    e.target.style.opacity = track.enabled ? "1" : "0.4";
  });

  /* ---------------- Face-presence check (video calls only) ---------------- */
  // Runs entirely client-side. If no face is visible in the local feed for a sustained
  // period, we warn then auto-end the call — this is the practical, low-false-positive
  // defence against a call being pointed at anything other than a person's face. It does
  // NOT apply once both people are in a consensual, age-verified 18+ pairing.
  const FACE_MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

  function loadFaceModel(){
    if(state.rtc.faceModelReady) return Promise.resolve(true);
    if(typeof faceapi === "undefined") return Promise.reject(new Error("face-api.js not loaded"));
    return faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL).then(()=>{
      state.rtc.faceModelReady = true;
      return true;
    });
  }

  function startFaceCheck(){
    loadFaceModel().then(()=>{
      state.rtc.noFaceStrikes = 0;
      state.rtc.faceTimer = setInterval(async ()=>{
        const video = $("#localVideo");
        if(!video || video.readyState < 2) return;
        try{
          const result = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions());
          if(result){
            state.rtc.noFaceStrikes = 0;
            cancelFaceWarning();
          } else {
            state.rtc.noFaceStrikes++;
            if(state.rtc.noFaceStrikes >= 2) beginFaceWarningCountdown();
          }
        }catch(e){ /* detection hiccup — ignore this tick */ }
      }, 1500);
    }).catch(()=>{
      toast("Face-presence check unavailable offline — this call isn't being monitored.");
    });
  }

  function stopFaceCheck(){
    clearInterval(state.rtc.faceTimer);
    cancelFaceWarning();
  }

  function beginFaceWarningCountdown(){
    if(state.rtc.countdownInterval) return; // already counting down
    let secs = 10;
    $("#faceWarning").hidden = false;
    $("#faceCountdown").textContent = secs;
    state.rtc.countdownInterval = setInterval(()=>{
      secs--;
      $("#faceCountdown").textContent = secs;
      if(secs <= 0){
        clearInterval(state.rtc.countdownInterval);
        state.rtc.countdownInterval = null;
        toast("Call ended — face wasn't visible. Repeated violations restrict calling privileges.");
        endCall(true);
      }
    }, 1000);
  }
  function cancelFaceWarning(){
    if(state.rtc.countdownInterval){ clearInterval(state.rtc.countdownInterval); state.rtc.countdownInterval = null; }
    $("#faceWarning").hidden = true;
  }

  // A browser tab opened via "open other side" auto-joins the shared room immediately.
  (function autoJoinFromUrl(){
    const code = new URLSearchParams(location.search).get("joinRoom");
    if(!code) return;
    openCallOverlay(true, "Joining call…");
    $("#callRoomBox").hidden = true;
    joinRoom(code);
  })();

  /* ---------------- Info overlay ---------------- */
  function showInfo(text){
    $("#infoText").textContent = text;
    $("#infoOverlay").hidden = false;
  }
  $("#infoCloseBtn").addEventListener("click", ()=>{ $("#infoOverlay").hidden = true; });

  /* ---------------- Profile screen ---------------- */
  function renderProfile(){
    const name = state.ob.username || "You";
    $("#myName").textContent = name;
    const myAvatarEl = $("#myAvatar");
    if(state.ob.photoUri){ myAvatarEl.style.backgroundImage = `url('${state.ob.photoUri}')`; myAvatarEl.textContent = ""; }
    else { myAvatarEl.style.backgroundImage = ""; myAvatarEl.textContent = name[0].toUpperCase(); }

    const badges = $("#myBadges");
    badges.innerHTML = "";
    badges.innerHTML += `<span class="badge badge--verified">✓ Phone verified</span>`;
    if(state.idVerified) badges.innerHTML += `<span class="badge badge--verified">✓ ID verified</span>`;
    if(state.ageVerified) badges.innerHTML += `<span class="badge badge--verified">✓ Age verified</span>`;

    $("#idVerifyStatus").textContent = state.idVerified ? "✓" : "·";
    $("#idVerifyStatus").classList.toggle("verify-status--done", state.idVerified);
    $("#idVerifyBtn").textContent = state.idVerified ? "Verified" : "Verify";
    $("#idVerifyBtn").disabled = state.idVerified;

    $("#ageVerifyStatus").textContent = state.ageVerified ? "✓" : "·";
    $("#ageVerifyStatus").classList.toggle("verify-status--done", state.ageVerified);
    $("#ageVerifyBtn").textContent = state.ageVerified ? "Verified" : "Verify";
    $("#ageVerifyBtn").disabled = state.ageVerified;

    renderProfilePhotoGrid();

    $("#ext18Locked").style.display = state.ageVerified ? "none" : "block";
    $("#ext18Choices").style.opacity = state.ageVerified ? "1" : "0.4";
    $("#ext18Choices").style.pointerEvents = state.ageVerified ? "auto" : "none";
    $$('.choice-card[data-vis]').forEach(c=> c.classList.toggle("is-selected", c.dataset.vis === state.ext18Mode));

    const chips = $("#profileReasonChips");
    chips.innerHTML = (state.ob.reasons.length ? state.ob.reasons : ["Not set yet"]).map(r=>`<span class="chip is-selected">${r}</span>`).join("");

    $("#profileBioText").textContent = state.ob.bio || "No bio added yet.";

    const socials = $("#profileSocials");
    socials.innerHTML = "";
    [state.ob.social1, state.ob.social2].filter(Boolean).forEach(s=>{
      socials.innerHTML += `<div class="social-row">🔗 ${s}</div>`;
    });
    if(!state.ob.social1 && !state.ob.social2) socials.innerHTML = `<p class="muted-sm">None linked yet.</p>`;
  }

  $("#idVerifyBtn").addEventListener("click", ()=>{
    showInfo("Prototype: this would launch a guided document-capture flow (e.g. driver's licence or passport) through a third-party verification vendor. Merj never stores the raw ID image.");
    state.idVerified = true;
    setTimeout(renderProfile, 300);
  });
  $("#ageVerifyBtn").addEventListener("click", ()=>{
    showInfo("Prototype: this would run a brief on-device liveness/face-age check (no photo ID needed). Only a yes/no age result is kept — the scan itself isn't stored.");
    state.ageVerified = true;
    setTimeout(renderProfile, 300);
  });
  $("#ext18Choices").addEventListener("click", (e)=>{
    const card = e.target.closest(".choice-card");
    if(!card || !state.ageVerified) return;
    state.ext18Mode = card.dataset.vis;
    renderProfile();
    toast(`18+ extension set to "${card.textContent.trim()}"`);
  });

  /* ---------------- Filters ---------------- */
  function updateFilterSummary(){
    $("#filterSummaryDistance").textContent = `${$("#rangeDistance").value} km`;
    $("#filterSummaryAge").textContent = `${$("#rangeAgeMin").value}–${$("#rangeAgeMax").value}`;
  }
  $("#rangeDistance").addEventListener("input", e=>{ $("#distanceVal").textContent = e.target.value; updateFilterSummary(); });
  $("#rangeAgeMin").addEventListener("input", e=>{
    if(Number(e.target.value) > Number($("#rangeAgeMax").value)) e.target.value = $("#rangeAgeMax").value;
    $("#ageMinVal").textContent = e.target.value;
    updateFilterSummary();
  });
  $("#rangeAgeMax").addEventListener("input", e=>{
    if(Number(e.target.value) < Number($("#rangeAgeMin").value)) e.target.value = $("#rangeAgeMin").value;
    $("#ageMaxVal").textContent = e.target.value;
    updateFilterSummary();
  });
  $("#filterReasonChips").addEventListener("click", e=>{
    const chip = e.target.closest(".chip");
    if(!chip) return;
    chip.classList.toggle("is-selected");
  });
  $("#resetFilters").addEventListener("click", ()=>{
    $("#rangeDistance").value = 50; $("#distanceVal").textContent = 50;
    $("#rangeAgeMin").value = 18; $("#ageMinVal").textContent = 18;
    $("#rangeAgeMax").value = 45; $("#ageMaxVal").textContent = 45;
    $$("#filterReasonChips .chip").forEach(c=>c.classList.remove("is-selected"));
    $("#show18Toggle").checked = false;
    $("#verifiedOnlyToggle").checked = true;
    updateFilterSummary();
    toast("Filters reset");
  });

  // Drag-to-reorder sort priority list
  let dragEl = null;
  $("#sortList").addEventListener("dragstart", e=>{
    dragEl = e.target.closest("li");
    dragEl.classList.add("dragging");
  });
  $("#sortList").addEventListener("dragend", ()=>{ dragEl && dragEl.classList.remove("dragging"); dragEl=null; });
  $("#sortList").addEventListener("dragover", e=>{
    e.preventDefault();
    const list = $("#sortList");
    const after = [...list.querySelectorAll("li:not(.dragging)")].find(li=>{
      const box = li.getBoundingClientRect();
      return e.clientY < box.top + box.height/2;
    });
    if(!dragEl) return;
    if(after) list.insertBefore(dragEl, after);
    else list.appendChild(dragEl);
  });

  /* ---------------- Trust & Safety scoring engine ---------------- */
  // Weighted-signal model: nothing here is a hard auto-block on its own, because every signal
  // has real false positives (expats, travellers, VPN users, people who just got a new SIM).
  // The score instead decides a graduated response — that graduation is the point.
  function computeTrustScore(profile){
    const factors = [];
    let score = 0;
    if(profile.duplicateImageFlag){ score += 35; factors.push("Profile photo matches images found elsewhere / on other profiles"); }
    if(profile.declaredCountry !== profile.ipCountry){ score += 15; factors.push(`IP location (${profile.ipCountry}) doesn't match declared country (${profile.declaredCountry})`); }
    if(profile.declaredCountry !== profile.phoneCountry){ score += 15; factors.push(`Phone number country (${profile.phoneCountry}) doesn't match declared country (${profile.declaredCountry})`); }
    if(profile.aiPhotoSuspected){ score += 20; factors.push("Primary photo flagged as possibly AI-generated (weak signal, low confidence)"); }
    if(profile.likeRatio >= 0.85){ score += 20; factors.push(`Swipes right on ${Math.round(profile.likeRatio*100)}% of profiles shown — bot-like`); }
    if(profile.accountAgeDays <= 2){ score += 10; factors.push("Account created in the last 48 hours"); }
    if(/whatsapp|telegram|snapchat me|cash ?app|venmo|invest|crypto/i.test(profile.bio)){ score += 15; factors.push("Bio contains off-platform redirect / financial language"); }
    const reportWeight = profile._reportWeight || 0;
    if(reportWeight > 0){ score += Math.min(reportWeight * 12, 30); factors.push(`${reportWeight.toFixed(1)} weighted report(s) filed against this profile`); }
    if(profile.videoVerified){ score -= 25; factors.push("✓ Video-verified: a matched user confirmed they matched their photos on a call (reduces risk)"); }
    if(profile.videoMismatchReported){ score += 25; factors.push("A video call partner reported this profile didn't match who appeared on camera"); }
    score = Math.max(0, Math.min(score, 100));
    let tier, action;
    if(score >= 50){ tier = "high"; action = "Auto-limited: messaging/swiping frozen pending human review."; }
    else if(score >= 20){ tier = "med"; action = "Shadow-throttled: shown to fewer people while signals accumulate."; }
    else { tier = "low"; action = "No action — within normal range."; }
    return { score, tier, factors, action };
  }

  function renderSafetyScreen(){
    populateReportTargets();
    $("#myReportCount").textContent = state.myReportCount > 0 ? `You've filed ${state.myReportCount} report(s).` : "";
    const list = $("#trustDemoList");
    list.innerHTML = "";
    PROFILES.forEach(p=>{
      const r = computeTrustScore(p);
      const row = document.createElement("div");
      row.className = "trust-row";
      row.innerHTML = `
        <div class="trust-row-top"><strong>${p.name}, ${p.age}</strong><span class="trust-score trust-score--${r.tier}">${r.score}/100</span></div>
        ${r.factors.length ? `<ul class="trust-factors">${r.factors.map(f=>`<li>${f}</li>`).join("")}</ul>` : `<p class="muted-sm" style="margin:0;">No risk signals detected.</p>`}
        <p class="trust-action">${r.action}</p>`;
      list.appendChild(row);
    });
  }

  function populateReportTargets(){
    const sel = $("#reportTarget");
    const prev = sel.value;
    sel.innerHTML = PROFILES.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
    if(prev) sel.value = prev;
  }

  /* ---------------- Report ---------------- */
  $("#reportBtn").addEventListener("click", ()=>{
    const targetId = Number($("#reportTarget").value);
    const reason = $("#reportReason").value;
    const target = PROFILES.find(p=>p.id === targetId);
    if(!target) return;
    if(state.reportsMade[targetId]){
      toast("You've already reported this profile — it's in our review queue.");
      return;
    }
    state.reportsMade[targetId] = true;
    state.myReportCount++;
    // Reporter-trust throttle: filing a lot of reports quickly quietly discounts future ones,
    // to blunt coordinated pile-ons without telling the reporter their weight was cut (that
    // would just teach abusers how to route around it).
    if(state.myReportCount > 5) state.myReportTrust = 0.4;
    else if(state.myReportCount > 2) state.myReportTrust = 0.7;
    target._reportWeight = (target._reportWeight || 0) + state.myReportTrust;
    toast(`Report submitted (${reason}). Our trust & safety team reviews these within 24 hours.`);
    renderSafetyScreen();
  });

  /* ---------------- Activity history ---------------- */
  $("#activityTabs").addEventListener("click", (e)=>{
    const tab = e.target.closest(".activity-tab");
    if(!tab) return;
    $$(".activity-tab").forEach(t=>t.classList.toggle("is-active", t===tab));
    const name = tab.dataset.atab;
    $$(".activity-pane").forEach(p=>p.classList.toggle("is-active", p.dataset.apane===name));
  });

  function renderActivity(){
    const likesList = $("#likesList");
    likesList.innerHTML = "";
    if(state.likesReceived.length === 0){
      likesList.innerHTML = `<p class="muted-sm">No one new yet — check back soon.</p>`;
    }
    sortProfiles(state.likesReceived, $("#likesSort")?.value || "proximity").forEach(p=>{
      const row = document.createElement("div");
      row.className = "like-row";
      row.innerHTML = `${avatarHtml(p)}
        <div><strong>${p.name}, ${p.age}</strong><p class="last-msg">${p.distance} km away</p></div>
        <div class="like-meta"><button class="btn btn--primary btn--sm" data-like-back="${p.id}">Like back</button></div>`;
      row.querySelector("[data-like-back]").addEventListener("click", e=>{ e.stopPropagation(); likeBack(p.id); });
      row.addEventListener("click", ()=> openProfileDetail(p, "like"));
      likesList.appendChild(row);
    });

    const matchesList = $("#activityMatchesList");
    matchesList.innerHTML = "";
    if(state.matches.length === 0) matchesList.innerHTML = `<p class="muted-sm">No matches yet.</p>`;
    sortProfiles(state.matches, $("#matchesSort")?.value || "proximity").forEach(p=>{
      const row = document.createElement("div");
      row.className = "like-row";
      row.innerHTML = `${avatarHtml(p)}<div><strong>${p.name}</strong><p class="last-msg">${lastSeenLabel(p)}</p></div>`;
      row.addEventListener("click", ()=> openProfileDetail(p, "match"));
      matchesList.appendChild(row);
    });

    renderCallRequests();
    const callList = $("#callHistoryList");
    callList.innerHTML = state.callHistory.length
      ? state.callHistory.map(c=>`
        <div class="call-log-row">
          <span class="call-kind">${c.kind === "video" ? "🎥" : "📞"}</span>
          <div><strong>${c.name}</strong><p class="last-msg">${c.kind} call · ${Math.floor(c.durationSec/60)}m ${c.durationSec%60}s</p></div>
          <div class="call-meta">${c.at.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</div>
        </div>`).join("")
      : `<p class="muted-sm">No calls yet — matched users can call from any chat.</p>`;
  }

  function likeBack(id){
    const liked = state.likesReceived.find(p=>p.id===id);
    if(!liked) return;
    state.likesReceived = state.likesReceived.filter(p=>p.id!==id);
    createMatch(liked.reasons ? liked : { ...liked, reasons:["Long term"], bio:"", interests:[] });
    renderActivity();
  }

  $("#likesSort").addEventListener("change", renderActivity);
  $("#matchesSort").addEventListener("change", renderActivity);
  $("#mainMatchesSort").addEventListener("change", renderMatches);

  /* ---------------- Settings ---------------- */
  const USERNAME_KEY = "merj_username_last_changed";

  function daysSince(ts){ return (Date.now() - ts) / (1000*60*60*24); }

  function renderSettings(){
    $("#settingsUsername").value = state.ob.username || "";
    const lastChanged = Number(localStorage.getItem(USERNAME_KEY) || 0);
    const daysLeft = Math.ceil(365 - daysSince(lastChanged));
    const hint = $("#usernameHint");
    if(lastChanged && daysLeft > 0){
      hint.textContent = `You can change your username again in ${daysLeft} day(s).`;
      $("#settingsUsername").disabled = true;
      $("#usernameSaveBtn").disabled = true;
    } else {
      hint.textContent = "Usernames can be changed once per year.";
      $("#settingsUsername").disabled = false;
      $("#usernameSaveBtn").disabled = false;
    }

    $$('.choice-card[data-vismode]').forEach(c=> c.classList.toggle("is-selected", c.dataset.vismode === state.visibility));
    $("#pauseToggle").checked = state.paused;
    $("#onlineStatusToggle").checked = state.showOnlineStatus;

    $$('.choice-card[data-callperm]').forEach(c=> c.classList.toggle("is-selected", c.dataset.callperm === state.callPermission));
    renderApprovedCallersList();

    const grid = $("#notifGrid");
    const rows = [["match","New matches"],["message","New messages"],["like","New likes"],["call","Calls"]];
    grid.innerHTML = `<div></div><div class="notif-head">Push</div><div class="notif-head">Email</div><div class="notif-head">SMS</div>` +
      rows.map(([key,label])=>`
        <div class="notif-label">${label}</div>
        <input type="checkbox" data-notif="${key}" data-channel="push" ${state.notifPrefs[key].push?"checked":""}>
        <input type="checkbox" data-notif="${key}" data-channel="email" ${state.notifPrefs[key].email?"checked":""}>
        <input type="checkbox" data-notif="${key}" data-channel="sms" ${state.notifPrefs[key].sms?"checked":""}>
      `).join("");
  }

  $("#usernameSaveBtn").addEventListener("click", ()=>{
    const val = $("#settingsUsername").value.trim();
    if(!val){ toast("Username can't be empty."); return; }
    state.ob.username = val;
    localStorage.setItem(USERNAME_KEY, String(Date.now()));
    toast("Username updated. Next change available in 365 days.");
    renderSettings();
  });

  $$('.choice-card[data-vismode]').forEach(card=>{
    card.addEventListener("click", ()=>{
      $$('.choice-card[data-vismode]').forEach(c=>c.classList.remove("is-selected"));
      card.classList.add("is-selected");
      state.visibility = card.dataset.vismode;
      toast(state.visibility === "private" ? "Profile hidden from Discover. Existing chats still work." : "Profile is public again.");
    });
  });

  $("#onlineStatusToggle").addEventListener("change", (e)=>{
    state.showOnlineStatus = e.target.checked;
    toast(state.showOnlineStatus ? "Your online status is visible to others." : "Your online status is now hidden.");
  });

  $$('.choice-card[data-callperm]').forEach(card=>{
    card.addEventListener("click", ()=>{
      $$('.choice-card[data-callperm]').forEach(c=>c.classList.remove("is-selected"));
      card.classList.add("is-selected");
      state.callPermission = card.dataset.callperm;
      toast(`Calls: ${card.querySelector("strong").textContent} selected.`);
    });
  });

  function renderApprovedCallersList(){
    $("#approvedCallersBox").hidden = state.callPermission === "everyone";
    const box = $("#approvedCallersList");
    if(state.matches.length === 0){
      box.innerHTML = `<p class="muted-sm">No matches yet to approve.</p>`;
      return;
    }
    box.innerHTML = state.matches.map(m => `
      <label class="toggle-row">
        <span>${m.name}</span>
        <input type="checkbox" data-approved-caller="${m.name}" ${state.approvedCallers.has(m.name) ? "checked" : ""}>
        <span class="toggle-switch"></span>
      </label>`).join("");
  }
  $("#approvedCallersList").addEventListener("change", (e)=>{
    const name = e.target.dataset.approvedCaller;
    if(!name) return;
    if(e.target.checked) state.approvedCallers.add(name);
    else state.approvedCallers.delete(name);
  });

  $("#pauseToggle").addEventListener("change", (e)=>{
    state.paused = e.target.checked;
    toast(state.paused ? "Account paused — you're hidden and won't see new profiles." : "Welcome back — Discover is active again.");
  });

  $("#notifGrid").addEventListener("change", (e)=>{
    const input = e.target;
    if(input.type !== "checkbox") return;
    state.notifPrefs[input.dataset.notif][input.dataset.channel] = input.checked;
  });

  let deleteArmed = false;
  $("#deleteAccountBtn").addEventListener("click", (e)=>{
    if(!deleteArmed){
      deleteArmed = true;
      e.target.textContent = "Click again to permanently delete — this can't be undone";
      setTimeout(()=>{ deleteArmed = false; e.target.textContent = "Delete account"; }, 4000);
      return;
    }
    toast("Account deleted. (Prototype: no data was actually stored anywhere to delete.)");
    deleteArmed = false;
    e.target.textContent = "Delete account";
    showScreen("landing");
  });

  /* ---------------- Profile detail screen ---------------- */
  function openProfileDetail(profile, context){
    state.detailProfile = profile;
    state.detailContext = context;
    state.detailPhotoIndex = 0;
    renderProfileDetail();
    showScreen("profileDetail");
  }

  function renderProfileDetail(){
    const p = state.detailProfile;
    if(!p) return;
    const photos = p.photos && p.photos.length ? p.photos : (p.photoUri ? [p.photoUri] : []);
    $("#detailPhotoImg").src = photos[state.detailPhotoIndex] || "";
    $("#detailPhotoDots").innerHTML = photos.length > 1
      ? photos.map((_,i)=>`<span class="${i===state.detailPhotoIndex ? "is-active" : ""}"></span>`).join("")
      : "";
    $("#detailName").textContent = `${p.name}, ${p.age}`;
    const statusText = typeof p.lastActiveMins === "number" ? ` · ${lastSeenLabel(p)}` : "";
    $("#detailMeta").textContent = `${p.distance} km away${statusText}`;
    $("#detailTags").innerHTML = (p.reasons || []).map(r => `<span class="tag">${r}</span>`).join("");
    $("#detailBio").textContent = p.bio || "";
    $("#detailVerifiedRow").innerHTML = p.verified ? `<div class="card-verified">✓ Phone verified</div>` : "";

    const msgBtn = $("#detailMessageBtn");
    const unmatchBtn = $("#detailUnmatchBtn");
    if(state.detailContext === "match"){
      msgBtn.textContent = "Message";
      unmatchBtn.hidden = false;
    } else if(state.detailContext === "like"){
      msgBtn.textContent = "Like back";
      unmatchBtn.hidden = true;
    } else {
      msgBtn.textContent = "Like";
      unmatchBtn.hidden = true;
    }
  }

  $("#detailBackBtn").addEventListener("click", ()=>{
    const back = state.detailContext === "deck" ? "discover" : (state.detailContext === "like" ? "activity" : "matches");
    showScreen(back);
  });
  $("#detailPrevZone").addEventListener("click", ()=> stepDetailPhoto(-1));
  $("#detailNextZone").addEventListener("click", ()=> stepDetailPhoto(1));
  function stepDetailPhoto(dir){
    const p = state.detailProfile;
    const photos = p.photos && p.photos.length ? p.photos : [p.photoUri];
    state.detailPhotoIndex = (state.detailPhotoIndex + dir + photos.length) % photos.length;
    renderProfileDetail();
  }
  $("#detailUnmatchBtn").addEventListener("click", ()=>{
    unmatchProfile(state.detailProfile.id);
    showScreen("matches");
  });
  $("#detailMessageBtn").addEventListener("click", ()=>{
    const p = state.detailProfile;
    if(state.detailContext === "match") openChat(p.id);
    else if(state.detailContext === "like") { likeBack(p.id); showScreen("discover"); openChat(p.id); }
    else {
      const top = $(".swipe-card:last-child");
      if(state.deck[state.deckIndex] && state.deck[state.deckIndex].id === p.id) resolveSwipe(p, "like", top);
      showScreen("discover");
    }
  });

  /* ---------------- Call permissions & request log ---------------- */
  function shouldAcceptCall(callerName){
    if(state.approvedCallers.has(callerName)) return true;
    return state.callPermission === "everyone";
  }

  function logBlockedCall(name, kind, code){
    state.callRequestLog.unshift({ name, kind, code, at: new Date() });
    toast(`Missed ${kind} call from ${name} — blocked by your call settings.`);
    if(state.screen === "activity") renderActivity();
  }

  function renderCallRequests(){
    const box = $("#callRequestsList");
    if(state.callRequestLog.length === 0){
      box.innerHTML = `<p class="muted-sm">No blocked call attempts.</p>`;
      return;
    }
    box.innerHTML = "";
    state.callRequestLog.forEach(entry=>{
      const row = document.createElement("div");
      row.className = "call-req-row";
      row.innerHTML = `<span class="call-kind">${entry.kind === "video" ? "🎥" : "📞"}</span>
        <div><strong>${entry.name}</strong><p class="last-msg">${entry.at.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</p></div>
        <div class="call-req-actions">
          <button class="btn btn--ghost btn--sm" data-callback>Call back</button>
          <button class="btn btn--ghost btn--sm" data-msgback>Message</button>
          <button class="btn btn--ghost btn--sm" data-approve>Approve</button>
        </div>`;
      row.querySelector("[data-callback]").addEventListener("click", ()=> joinRoom(entry.code));
      row.querySelector("[data-msgback]").addEventListener("click", ()=> messageFromLog(entry));
      row.querySelector("[data-approve]").addEventListener("click", ()=>{
        state.approvedCallers.add(entry.name);
        toast(`${entry.name} can now call you.`);
        renderCallRequests();
        renderApprovedCallersList();
      });
      box.appendChild(row);
    });
  }

  function messageFromLog(entry){
    const pseudoId = "peer-" + entry.code;
    if(!state.chats[pseudoId]) state.chats[pseudoId] = [];
    if(!state.matches.find(m=>m.id===pseudoId)){
      state.matches.unshift({ id: pseudoId, name: entry.name, initial: (entry.name[0]||"?").toUpperCase(), distance:0, reasons:[], bio:"" });
    }
    openChat(pseudoId);
  }

  /* ---------------- Post-call re-verification ---------------- */
  function maybeShowVerifyPrompt(){
    if(!state.rtc.connected || !state.rtc.activeCallProfileId || !state.rtc.wasVideo) return;
    $("#verifyPromptText").textContent = `Did ${state.rtc.activeCallProfileName || "the person you called"} match their profile pictures?`;
    $("#verifyPromptOverlay").hidden = false;
  }
  $("#verifyYesBtn").addEventListener("click", ()=>{
    const profile = PROFILES.find(p=>p.id === state.rtc.activeCallProfileId);
    if(profile){ profile.videoVerified = true; profile.videoMismatchReported = false; }
    toast("Marked as video-verified. Thanks — this helps keep Merj honest.");
    $("#verifyPromptOverlay").hidden = true;
    state.rtc.activeCallProfileId = null;
  });
  $("#verifyNoBtn").addEventListener("click", ()=>{
    const profile = PROFILES.find(p=>p.id === state.rtc.activeCallProfileId);
    if(profile){ profile.videoMismatchReported = true; profile.videoVerified = false; }
    toast("Thanks for flagging that — sent for review.");
    $("#verifyPromptOverlay").hidden = true;
    state.rtc.activeCallProfileId = null;
  });

  /* ---------------- Photo management (account) ---------------- */
  function renderProfilePhotoGrid(){
    const grid = $("#profilePhotoGrid");
    grid.innerHTML = "";
    state.ob.photos.forEach((p,i)=>{
      const slot = document.createElement("div");
      slot.className = "photo-slot photo-manage-slot" + (p ? " has-photo" : "");
      slot.draggable = !!p;
      slot.dataset.index = String(i);
      slot.innerHTML = p
        ? `<img src="${p}" alt="Photo ${i+1}"><button class="photo-remove" data-remove="${i}" aria-label="Remove photo">✕</button><span class="photo-order">${i+1}</span>`
        : `<label style="display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;height:100%;justify-content:center;cursor:pointer;"><span>📷<br>Add</span><input type="file" accept="image/*" data-addidx="${i}" style="position:absolute;inset:0;opacity:0;cursor:pointer;"></label>`;
      grid.appendChild(slot);
    });
    if(state.ob.photos.length < 6){
      const addSlot = document.createElement("label");
      addSlot.className = "photo-slot";
      addSlot.innerHTML = `<span>+ Add photo</span><input type="file" accept="image/*" id="addPhotoInput" style="position:absolute;inset:0;opacity:0;cursor:pointer;">`;
      grid.appendChild(addSlot);
    }
    wirePhotoManageDrag();
  }

  $("#profilePhotoGrid").addEventListener("change", (e)=>{
    const input = e.target;
    if(input.tagName !== "INPUT" || input.type !== "file" || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      if(input.id === "addPhotoInput"){
        state.ob.photos.push(reader.result);
      } else {
        const idx = Number(input.dataset.addidx);
        state.ob.photos[idx] = reader.result;
      }
      if(state.ob.username === "You" || !state.ob.photoUri) state.ob.photoUri = state.ob.photos.find(Boolean);
      renderProfilePhotoGrid();
    };
    reader.readAsDataURL(file);
  });

  $("#profilePhotoGrid").addEventListener("click", (e)=>{
    const removeBtn = e.target.closest("[data-remove]");
    if(!removeBtn) return;
    const idx = Number(removeBtn.dataset.remove);
    if(state.ob.photos.filter(Boolean).length <= 3){
      toast("You need at least 3 photos — add a replacement before removing this one.");
      return;
    }
    state.ob.photos.splice(idx, 1);
    renderProfilePhotoGrid();
  });

  let dragPhotoIdx = null;
  function wirePhotoManageDrag(){
    const slots = $$(".photo-manage-slot", $("#profilePhotoGrid"));
    slots.forEach(slot=>{
      slot.addEventListener("dragstart", ()=>{ dragPhotoIdx = Number(slot.dataset.index); slot.classList.add("dragging"); });
      slot.addEventListener("dragend", ()=> slot.classList.remove("dragging"));
      slot.addEventListener("dragover", (e)=> e.preventDefault());
      slot.addEventListener("drop", (e)=>{
        e.preventDefault();
        const targetIdx = Number(slot.dataset.index);
        if(dragPhotoIdx === null || dragPhotoIdx === targetIdx) return;
        const arr = state.ob.photos;
        const [moved] = arr.splice(dragPhotoIdx, 1);
        arr.splice(targetIdx, 0, moved);
        dragPhotoIdx = null;
        renderProfilePhotoGrid();
      });
    });
  }

  /* ---------------- Init ---------------- */
  buildPhotoGrid();
  $("#photoGrid").addEventListener("change", onPhotoSelected);
  updateOnboardUI();
  updateSwipeMeter();
  updateFilterSummary();
  restoreOnboardingDraftIfAny();
  loadRealProfiles();
})();
