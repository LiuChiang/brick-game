/**
 * Brick Quantum - game.js
 * 核心遊戲引擎，包含物理、動態主題渲染與 Web Audio API 音效合成
 */

// ==========================================
// 遊戲狀態與全域變數
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const STATE_START = 'START';
const STATE_PLAYING = 'PLAYING';
const STATE_PAUSED = 'PAUSED';
const STATE_CLEAR = 'CLEAR';
const STATE_GAMEOVER = 'GAMEOVER';

let gameState = STATE_START;
let score = 0;
let highScore = parseInt(localStorage.getItem('bq_highscore') || '0');
let lives = 3;
let currentLevel = 1;
let lastTime = 0;

// 物理參數與實體
let paddle = {
    x: 350,
    y: 550,
    w: 100,
    h: 15,
    baseW: 100,
    color: '#00f3ff',
    glowColor: '#00f3ff'
};

let balls = [];
let bricks = [];
let powerups = [];
let lasers = [];
let particles = [];

// 特效狀態
let screenShakeTime = 0;
let screenShakeIntensity = 0;
let bgOffset = 0; // 用於滾動背景

// 道具狀態計時器
let activePowerups = {
    laser: { active: false, timer: 0, duration: 10000 },
    wide: { active: false, timer: 0, duration: 12000 },
    sticky: { active: false, timer: 0, duration: 15000 },
    shield: { active: false } // 盾牌沒有時間限制，被撞擊一次後消失
};

// 聲音與音樂控制
let audioEnabled = true;
let musicEnabled = true;
let audioCtx = null;
let bgmNode = null;
let bgmIntervalId = null;

// ==========================================
// 音樂與音效合成系統 (Web Audio API)
// ==========================================

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// 合成音效
function playSound(type) {
    if (!audioEnabled) return;
    initAudio();
    if (!audioCtx) return;

    const theme = gameThemes[currentTheme];
    const time = audioCtx.currentTime;
    
    // 依據主題與音效類型，套用不同的合成參數
    switch (type) {
        case 'paddle':
            if (currentTheme === 'retro') {
                synth8BitTone(150, 0.08, 'triangle');
            } else if (currentTheme === 'aurora') {
                synthChime(523.25, 0.3, 0.01); // C5 clean chime
            } else {
                synthGlowTone(220, 330, 0.15, 'sine');
            }
            break;
            
        case 'wall':
            if (currentTheme === 'retro') {
                synth8BitTone(100, 0.05, 'square');
            } else if (currentTheme === 'aurora') {
                synthChime(392, 0.15, 0.02); // G4
            } else {
                synthGlowTone(180, 180, 0.1, 'sine');
            }
            break;
            
        case 'hit':
            if (currentTheme === 'retro') {
                synth8BitTone(300, 0.04, 'square');
            } else if (currentTheme === 'aurora') {
                synthChime(659.25, 0.1, 0.005); // E5
            } else {
                synthGlowTone(440, 554, 0.08, 'triangle');
            }
            break;
            
        case 'break':
            if (currentTheme === 'retro') {
                synthNoiseExplosion(0.15, 0.5);
            } else if (currentTheme === 'aurora') {
                synthChime(880, 0.4, 0.001); // A5 high chime
            } else if (currentTheme === 'cosmic') {
                synthSpaceSweep(600, 80, 0.35);
            } else { // cyber
                synthGlowTone(600, 150, 0.25, 'sawtooth');
                synthNoiseExplosion(0.08, 0.15);
            }
            break;

        case 'laser':
            synthLaserFire();
            break;

        case 'powerup':
            synthPowerupCollect();
            break;

        case 'shield':
            synthShieldLose();
            break;

        case 'levelclear':
            synthLevelClear();
            break;

        case 'gameover':
            synthGameOver();
            break;
    }
}

// 基礎音效合成元件
function synth8BitTone(freq, duration, type = 'square') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function synthGlowTone(startFreq, endFreq, duration, type = 'sine') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
    
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function synthChime(freq, duration, attack = 0.01) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function synthNoiseExplosion(duration, volume = 0.2) {
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + duration);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    noise.start();
}

function synthSpaceSweep(startFreq, endFreq, duration) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
    
    filter.type = 'peaking';
    filter.frequency.setValueAtTime(1500, audioCtx.currentTime);
    filter.Q.setValueAtTime(10, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + duration);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function synthLaserFire() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = currentTheme === 'retro' ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

function synthPowerupCollect() {
    const time = audioCtx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time + idx * 0.08);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.setValueAtTime(0.15, time + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, time + idx * 0.08 + 0.2);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(time + idx * 0.08);
        osc.stop(time + idx * 0.08 + 0.25);
    });
}

function synthShieldLose() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.4);
    
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
}

function synthLevelClear() {
    const time = audioCtx.currentTime;
    const arpeggio = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C Major scale arpeggio
    arpeggio.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time + idx * 0.07);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.setValueAtTime(0.15, time + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.02, time + idx * 0.07 + 0.3);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(time + idx * 0.07);
        osc.stop(time + idx * 0.07 + 0.4);
    });
}

function synthGameOver() {
    const time = audioCtx.currentTime;
    const notes = [392.00, 349.23, 311.13, 261.63]; // G4, F4, Eb4, C4 sliding down
    notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time + idx * 0.15);
        osc.frequency.linearRampToValueAtTime(freq - 50, time + idx * 0.15 + 0.18);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.setValueAtTime(0.15, time + idx * 0.15);
        gain.gain.linearRampToValueAtTime(0.01, time + idx * 0.15 + 0.18);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(time + idx * 0.15);
        osc.stop(time + idx * 0.15 + 0.2);
    });
}

// 實時音樂合成器 - BGM Bass/Chord 循環
function startBGM() {
    if (!musicEnabled) return;
    initAudio();
    if (!audioCtx) return;
    
    stopBGM();

    let step = 0;
    
    // 主題對應的和弦與節奏設定
    const themesBGM = {
        cyber: {
            tempo: 120, // BPM
            bassNotes: [55.00, 55.00, 65.41, 65.41, 73.42, 73.42, 65.41, 58.27], // A1, A1, C2, C2, D2, D2, C2, Bb1
            synthType: 'triangle',
            vol: 0.06
        },
        aurora: {
            tempo: 75,
            bassNotes: [73.42, 73.42, 87.31, 87.31, 98.00, 98.00, 87.31, 77.78], // D2, F2, G2, F2, Eb2
            synthType: 'sine',
            vol: 0.08
        },
        retro: {
            tempo: 135,
            bassNotes: [110.0, 130.8, 146.8, 130.8, 164.8, 146.8, 130.8, 98.0], // A2, C3, D3, C3, E3, D3, C3, G2
            synthType: 'square',
            vol: 0.04
        },
        cosmic: {
            tempo: 90,
            bassNotes: [55.00, 65.41, 73.42, 65.41, 82.41, 73.42, 65.41, 58.27],
            synthType: 'sawtooth',
            vol: 0.04
        }
    };

    const config = themesBGM[currentTheme] || themesBGM.cyber;
    const interval = (60 / config.tempo) * 1000 * 0.5; // 八分音符

    bgmIntervalId = setInterval(() => {
        if (!musicEnabled || gameState !== STATE_PLAYING) return;
        
        try {
            const time = audioCtx.currentTime;
            const noteIdx = Math.floor(step / 2) % config.bassNotes.length;
            const freq = config.bassNotes[noteIdx];
            
            // 播放貝斯音 (Bassline)
            if (step % 2 === 0 || currentTheme === 'cyber') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                
                osc.type = config.synthType;
                osc.frequency.setValueAtTime(freq, time);
                
                // 像素風格額外點綴一個高音
                if (currentTheme === 'retro' && step % 8 === 4) {
                    osc.frequency.setValueAtTime(freq * 2, time);
                }

                gain.gain.setValueAtTime(config.vol, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + (interval / 1000) * 0.9);
                
                // 星空風格增加一個簡單帶回音的低通濾波器
                if (currentTheme === 'cosmic') {
                    const lp = audioCtx.createBiquadFilter();
                    lp.type = 'lowpass';
                    lp.frequency.setValueAtTime(400, time);
                    osc.connect(lp);
                    lp.connect(gain);
                } else {
                    osc.connect(gain);
                }
                
                gain.connect(audioCtx.destination);
                
                osc.start(time);
                osc.stop(time + (interval / 1000) * 0.95);
            }
            
            // 播放和弦背景 (Chord Pads) - 每 4 拍換一次
            if (step % 8 === 0 && currentTheme !== 'retro') {
                const padGains = [];
                // 簡單的三和弦合成
                const root = freq * 4; // 升兩個八度
                const chordFrequencies = [root, root * 1.2, root * 1.5]; // 根音、三音、五音
                
                chordFrequencies.forEach((f) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(f, time);
                    
                    // 非常柔和的漸入漸出
                    gain.gain.setValueAtTime(0, time);
                    gain.gain.linearRampToValueAtTime(0.015, time + 0.5);
                    gain.gain.exponentialRampToValueAtTime(0.001, time + (interval / 1000) * 7.5);
                    
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    
                    osc.start(time);
                    osc.stop(time + (interval / 1000) * 8);
                });
            }

            step++;
        } catch (e) {
            console.error('BGM Error', e);
        }
    }, interval);
}

function stopBGM() {
    if (bgmIntervalId) {
        clearInterval(bgmIntervalId);
        bgmIntervalId = null;
    }
}

// ==========================================
// 主題視覺與行為設定 (Theme Configurations)
// ==========================================

let currentTheme = 'cyber';

const gameThemes = {
    cyber: {
        bg: '#080112',
        paddleColor: '#ff007f',
        paddleGlow: '#ff007f',
        ballColor: '#00f3ff',
        ballGlow: '#00f3ff',
        brickColors: ['#ff007f', '#00f3ff', '#ffe600', '#9d00ff', '#ff5500'],
        particleColor: '#00f3ff',
        particleShape: 'circle',
        drawBg: function(ctx, w, h) {
            // 繪製賽博龐克透視電網
            ctx.strokeStyle = 'rgba(255, 0, 127, 0.15)';
            ctx.lineWidth = 1;
            
            // 橫線
            const lineCount = 15;
            for (let i = 0; i < lineCount; i++) {
                const y = (h / lineCount) * i + (bgOffset % (h / lineCount));
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }
            
            // 直線（帶有透視感）
            const horizonX = w / 2;
            const horizonY = -200;
            const bottomSegments = 24;
            for (let i = 0; i <= bottomSegments; i++) {
                const x = (w / bottomSegments) * i;
                ctx.beginPath();
                ctx.moveTo(horizonX, horizonY);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
        }
    },
    aurora: {
        bg: '#0a1128',
        paddleColor: 'rgba(255, 255, 255, 0.8)',
        paddleGlow: 'rgba(255, 255, 255, 0.2)',
        ballColor: '#e2f1af',
        ballGlow: '#a1fab0',
        brickColors: ['#a18cd1', '#fbc2eb', '#84fab0', '#a1c4fd', '#e0c3fc'],
        particleColor: '#e2f1af',
        particleShape: 'circle',
        drawBg: function(ctx, w, h) {
            // 繪製緩慢流動的極光
            const grad = ctx.createRadialGradient(
                w / 2 + Math.sin(bgOffset * 0.015) * 150,
                200 + Math.cos(bgOffset * 0.01) * 100,
                50,
                w / 2, 200, 400
            );
            grad.addColorStop(0, 'rgba(132, 250, 176, 0.15)');
            grad.addColorStop(0.5, 'rgba(143, 211, 244, 0.1)');
            grad.addColorStop(1, 'rgba(10, 17, 40, 0)');
            
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            const grad2 = ctx.createRadialGradient(
                200 + Math.cos(bgOffset * 0.008) * 100,
                400 + Math.sin(bgOffset * 0.012) * 120,
                30,
                200, 400, 300
            );
            grad2.addColorStop(0, 'rgba(251, 194, 235, 0.12)');
            grad2.addColorStop(1, 'rgba(10, 17, 40, 0)');
            ctx.fillStyle = grad2;
            ctx.fillRect(0, 0, w, h);
        }
    },
    retro: {
        bg: '#000000',
        paddleColor: '#ffffff',
        paddleGlow: '#ffffff',
        ballColor: '#ffff00',
        ballGlow: '#ffff00',
        brickColors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'],
        particleColor: '#ffffff',
        particleShape: 'square',
        drawBg: function(ctx, w, h) {
            // 復古網格背景
            ctx.strokeStyle = '#222222';
            ctx.lineWidth = 2;
            const gridSize = 40;
            
            ctx.beginPath();
            for (let x = 0; x < w; x += gridSize) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
            }
            for (let y = 0; y < h; y += gridSize) {
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
            }
            ctx.stroke();

            // CRT 掃描線效果 (每隔數像素繪製一條細微暗線)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            for (let y = 0; y < h; y += 4) {
                ctx.fillRect(0, y, w, 1);
            }
        }
    },
    cosmic: {
        bg: '#020108',
        paddleColor: '#7f00ff',
        paddleGlow: '#ff00ff',
        ballColor: '#00e5ff',
        ballGlow: '#00e5ff',
        brickColors: ['#7f00ff', '#ff00ff', '#00e5ff', '#ff5d00', '#00ff66'],
        particleColor: '#00e5ff',
        particleShape: 'star',
        drawBg: function(ctx, w, h) {
            // 星空粒子背景繪製
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            const seed = 42; // 固定隨機種子星空
            for (let i = 0; i < 60; i++) {
                const starX = (Math.sin(i * 129.5) * 0.5 + 0.5) * w;
                const starY = ((Math.cos(i * 243.2) * 0.5 + 0.5) * h + bgOffset * (1 + (i % 3) * 0.5)) % h;
                const size = (i % 3) * 0.6 + 0.5;
                ctx.fillRect(starX, starY, size, size);
            }

            // 星河霧氣
            const nebula = ctx.createRadialGradient(
                w - 150, 100, 20, 
                w - 200, 150, 250
            );
            nebula.addColorStop(0, 'rgba(127, 0, 255, 0.08)');
            nebula.addColorStop(0.5, 'rgba(255, 0, 255, 0.04)');
            nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = nebula;
            ctx.fillRect(0, 0, w, h);
        }
    }
};

function changeTheme(themeName) {
    if (!gameThemes[themeName]) return;
    
    currentTheme = themeName;
    document.body.className = `theme-${themeName}`;
    
    // 更新主題按鈕狀態
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.getAttribute('data-theme') === themeName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 立即重新計算擋板顏色與粒子風格
    const t = gameThemes[themeName];
    paddle.color = t.paddleColor;
    paddle.glowColor = t.paddleGlow;

    // 將現有的球與粒子也變更顏色
    balls.forEach(ball => {
        ball.color = t.ballColor;
        ball.glowColor = t.ballGlow;
    });

    // 如果音樂正在播放，因主題改變而重新啟動
    if (bgmIntervalId) {
        startBGM();
    }
}

// 綁定風格切換按鈕事件
document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const theme = btn.getAttribute('data-theme');
        changeTheme(theme);
        playSound('paddle');
    });
});

// ==========================================
// 關卡設計 (Handcrafted Levels)
// ==========================================

const levelLayouts = [
    // Level 1: 簡單霓虹磚牆
    {
        cols: 10,
        rows: 4,
        padding: 6,
        topOffset: 80,
        map: [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
        ]
    },
    // Level 2: 裝甲堡壘 (防護牆 + 高價值黃金核心)
    {
        cols: 12,
        rows: 6,
        padding: 5,
        topOffset: 70,
        map: [
            [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
            [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
            [2, 0, 5, 5, 0, 9, 9, 0, 5, 5, 0, 2], // 9 代表 3HP 裝甲磚塊，5 代表黃金核心
            [2, 0, 5, 9, 9, 9, 9, 9, 9, 5, 0, 2],
            [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
            [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
        ]
    },
    // Level 3: 螺旋漩渦 (Helix)
    {
        cols: 11,
        rows: 8,
        padding: 6,
        topOffset: 60,
        map: [
            [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
            [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
            [0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0],
            [0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0],
            [0, 0, 1, 1, 1, 5, 1, 1, 1, 0, 0],
            [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
            [0, 0, 0, 4, 4, 4, 4, 4, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        ]
    },
    // Level 4: 太空侵略者 (Space Invader - 含左右移動的列!)
    {
        cols: 11,
        rows: 7,
        padding: 8,
        topOffset: 70,
        movingRows: [1, 3, 5], // 哪幾列會移動
        map: [
            [0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0],
            [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0],
            [0, 0, 2, 2, 2, 2, 2, 2, 2, 0, 0],
            [0, 2, 2, 9, 2, 2, 2, 9, 2, 2, 0],
            [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
            [2, 0, 2, 2, 2, 2, 2, 2, 2, 0, 2],
            [2, 0, 2, 0, 0, 0, 0, 0, 2, 0, 2]
        ]
    },
    // Level 5: 傳送門迴圈 (Portal Gateway)
    {
        cols: 12,
        rows: 8,
        padding: 5,
        topOffset: 70,
        portals: [ // 傳送門定義
            { id: 1, x1: 50, y1: 250, x2: 730, y2: 250, r: 15, color: '#00f3ff' },
            { id: 2, x1: 50, y1: 150, x2: 730, y2: 150, r: 15, color: '#ff007f' }
        ],
        map: [
            [9, 9, 9, 9, 0, 0, 0, 0, 9, 9, 9, 9],
            [9, 5, 5, 9, 0, 3, 3, 0, 9, 5, 5, 9],
            [0, 9, 9, 0, 1, 1, 1, 1, 0, 9, 9, 0],
            [0, 0, 0, 0, 2, 5, 5, 2, 0, 0, 0, 0],
            [1, 1, 0, 9, 9, 0, 0, 9, 9, 0, 1, 1],
            [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2],
            [3, 3, 3, 0, 4, 4, 4, 4, 0, 3, 3, 3],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        ]
    }
];

function buildBricks(levelNum) {
    bricks = [];
    let layout;

    if (levelNum <= levelLayouts.length) {
        layout = levelLayouts[levelNum - 1];
    } else {
        // Level 6+ 隨機程序生成 (難度隨關卡遞增)
        layout = generateProceduralLayout(levelNum);
    }

    const t = gameThemes[currentTheme];
    const brickW = (canvas.width - 40 - (layout.cols - 1) * layout.padding) / layout.cols;
    const brickH = 20;

    for (let r = 0; r < layout.rows; r++) {
        for (let c = 0; c < layout.cols; c++) {
            const brickType = layout.map[r][c];
            if (brickType === 0) continue;

            let hp = 1;
            let maxHp = 1;
            let points = 100;
            let colorIdx = (r + c) % t.brickColors.length;
            let isGolden = false;

            if (brickType === 9) { // 裝甲磚塊
                hp = Math.min(3, Math.floor(1 + levelNum * 0.3)); // 隨著關卡上升更耐打
                maxHp = hp;
                points = 300;
            } else if (brickType === 5) { // 黃金核心磚塊
                hp = 5;
                maxHp = 5;
                points = 1000;
                isGolden = true;
            }

            const bx = 20 + c * (brickW + layout.padding);
            const by = layout.topOffset + r * (brickH + layout.padding);

            // 是否是移動磚塊
            const isMoving = layout.movingRows && layout.movingRows.includes(r);

            bricks.push({
                x: bx,
                y: by,
                w: brickW,
                h: brickH,
                hp: hp,
                maxHp: maxHp,
                points: points,
                colorIdx: colorIdx,
                isGolden: isGolden,
                isMoving: isMoving,
                moveDir: 1,
                moveSpeed: 0.5 + (levelNum * 0.1),
                row: r,
                col: c,
                startX: bx,
                rowWidth: (brickW + layout.padding) * layout.cols
            });
        }
    }

    // 傳送門註冊 (只在有傳送門的關卡)
    canvasPortals = layout.portals || [];
}

let canvasPortals = [];

// 程序化隨機關卡生成器
function generateProceduralLayout(levelNum) {
    const cols = Math.min(15, 8 + Math.floor(levelNum * 0.5));
    const rows = Math.min(10, 4 + Math.floor(levelNum * 0.4));
    const padding = Math.max(4, 8 - Math.floor(levelNum * 0.2));
    const topOffset = 70;
    const map = [];

    // 隨機生成矩陣
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            const rand = Math.random();
            if (rand < 0.25) {
                row.push(0); // 空白
            } else if (rand < 0.75) {
                row.push(1); // 一般磚塊
            } else if (rand < 0.9) {
                row.push(9); // 裝甲磚塊
            } else {
                row.push(5); // 黃金磚塊
            }
        }
        map.push(row);
    }

    // 移動列
    const movingRows = [];
    if (levelNum % 2 === 0) {
        movingRows.push(1);
        if (rows > 5) movingRows.push(3);
    }

    return { cols, rows, padding, topOffset, map, movingRows };
}

// ==========================================
// 核心物理與更新邏輯
// ==========================================

function spawnBall(x, y, launch = false) {
    const speed = 4.5 + (currentLevel * 0.35); // 球速隨關卡上升
    const angle = (Math.random() * 60 - 30) * Math.PI / 180; // 隨機偏斜角
    const t = gameThemes[currentTheme];
    
    balls.push({
        x: x,
        y: y,
        vx: launch ? Math.sin(angle) * speed : 0,
        vy: launch ? -Math.cos(angle) * speed : 0,
        radius: 8,
        color: t.ballColor,
        glowColor: t.ballGlow,
        sticky: !launch,
        trail: [] // 記錄軌跡
    });
}

function launchBall(ball) {
    if (!ball.sticky) return;
    const speed = 4.5 + (currentLevel * 0.35);
    const angle = (Math.random() * 40 - 20) * Math.PI / 180;
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    ball.sticky = false;
    playSound('paddle');
}

function updatePhysics(dt) {
    // 1. 擋板寬度與位置更新 (隨滑鼠移動更新，在 mousemove 事件中處理，此處做道具計時)
    if (activePowerups.wide.active) {
        activePowerups.wide.timer -= dt;
        paddle.w = paddle.baseW * 1.5;
        if (activePowerups.wide.timer <= 0) {
            activePowerups.wide.active = false;
            paddle.w = paddle.baseW;
        }
    } else {
        paddle.w = paddle.baseW;
    }

    if (activePowerups.laser.active) {
        activePowerups.laser.timer -= dt;
        if (activePowerups.laser.timer <= 0) {
            activePowerups.laser.active = false;
        }
    }

    if (activePowerups.sticky.active) {
        activePowerups.sticky.timer -= dt;
        if (activePowerups.sticky.timer <= 0) {
            activePowerups.sticky.active = false;
            // 釋放所有被黏住的球
            balls.forEach(b => {
                if (b.sticky) launchBall(b);
            });
        }
    }

    // 更新道具剩餘時間的 UI 顯示
    updatePowerupUI();

    // 2. 移動磚塊位置更新
    bricks.forEach(b => {
        if (b.isMoving) {
            b.x += b.moveSpeed * b.moveDir;
            // 限制邊界
            const leftLimit = b.startX - 30;
            const rightLimit = b.startX + 30;
            if (b.x <= Math.max(10, leftLimit) || b.x + b.w >= Math.min(canvas.width - 10, rightLimit)) {
                b.moveDir *= -1;
            }
        }
    });

    // 3. 雷射子彈更新
    for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        l.y += l.vy;
        
        // 邊界檢查
        if (l.y < 0) {
            lasers.splice(i, 1);
            continue;
        }

        // 與磚塊碰撞
        let hit = false;
        for (let j = bricks.length - 1; j >= 0; j--) {
            const b = bricks[j];
            if (l.x >= b.x && l.x <= b.x + b.w && l.y >= b.y && l.y <= b.y + b.h) {
                damageBrick(b, j);
                hit = true;
                break;
            }
        }

        if (hit) {
            lasers.splice(i, 1);
        }
    }

    // 4. 傳送門邏輯
    canvasPortals.forEach(portal => {
        balls.forEach(ball => {
            // 檢查是否進入 Portal 1 (x1, y1)
            let d1 = Math.hypot(ball.x - portal.x1, ball.y - portal.y1);
            if (d1 < portal.r + ball.radius && !ball.justTeleported) {
                ball.x = portal.x2;
                ball.y = portal.y2;
                ball.justTeleported = true;
                playSound('wall');
                triggerTeleportParticles(portal.x1, portal.y1, portal.x2, portal.y2, portal.color);
            }

            // 檢查是否進入 Portal 2 (x2, y2)
            let d2 = Math.hypot(ball.x - portal.x2, ball.y - portal.y2);
            if (d2 < portal.r + ball.radius && !ball.justTeleported) {
                ball.x = portal.x1;
                ball.y = portal.y1;
                ball.justTeleported = true;
                playSound('wall');
                triggerTeleportParticles(portal.x2, portal.y2, portal.x1, portal.y1, portal.color);
            }

            // 離開傳送門範圍後重置傳送旗標
            if (d1 > portal.r + ball.radius + 15 && d2 > portal.r + ball.radius + 15) {
                ball.justTeleported = false;
            }
        });
    });

    // 5. 球體物理更新
    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];

        if (ball.sticky) {
            // 黏住時球的位置跟著擋板
            ball.x = paddle.x + paddle.w / 2;
            ball.y = paddle.y - ball.radius;
            continue;
        }

        // 儲存軌跡歷史
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 8) {
            ball.trail.shift();
        }

        // 更新位置
        ball.x += ball.vx;
        ball.y += ball.vy;

        // 牆壁碰撞 (左右牆壁)
        if (ball.x - ball.radius <= 0) {
            ball.x = ball.radius;
            ball.vx = -ball.vx;
            playSound('wall');
        } else if (ball.x + ball.radius >= canvas.width) {
            ball.x = canvas.width - ball.radius;
            ball.vx = -ball.vx;
            playSound('wall');
        }

        // 天花板碰撞
        if (ball.y - ball.radius <= 0) {
            ball.y = ball.radius;
            ball.vy = -ball.vy;
            playSound('wall');
        }

        // 擋板防護罩 (Bottom Laser Shield)
        if (activePowerups.shield.active && ball.y + ball.radius >= 580) {
            ball.vy = -Math.abs(ball.vy);
            ball.y = 580 - ball.radius;
            activePowerups.shield.active = false;
            playSound('shield');
            triggerScreenShake(8, 200);
            continue;
        }

        // 底部界外墜落
        if (ball.y - ball.radius >= canvas.height) {
            balls.splice(i, 1);
            continue;
        }

        // 擋板碰撞
        if (ball.y + ball.radius >= paddle.y && 
            ball.y - ball.radius <= paddle.y + paddle.h &&
            ball.x + ball.radius >= paddle.x && 
            ball.x - ball.radius <= paddle.x + paddle.w) {
            
            // 確保球往上反彈
            ball.vy = -Math.abs(ball.vy);
            ball.y = paddle.y - ball.radius;

            // 彈性角度控制：擊中擋板左右邊緣反彈角度更大
            const relativeIntersectX = (paddle.x + (paddle.w / 2)) - ball.x;
            const normalizedIntersectX = relativeIntersectX / (paddle.w / 2); // 介於 -1 到 1
            const bounceAngle = normalizedIntersectX * (Math.PI / 3); // 最大反彈角 60 度

            const speed = Math.hypot(ball.vx, ball.vy);
            ball.vx = -speed * Math.sin(bounceAngle);
            ball.vy = -speed * Math.cos(bounceAngle);

            // 黏性道具邏輯
            if (activePowerups.sticky.active) {
                ball.sticky = true;
                ball.vx = 0;
                ball.vy = 0;
            }

            playSound('paddle');
            triggerPaddleParticles(ball.x, ball.y, gameThemes[currentTheme].ballColor);
        }

        // 磚塊碰撞偵測
        for (let j = bricks.length - 1; j >= 0; j--) {
            const b = bricks[j];
            
            // 找出球在磚塊矩形上最接近的點
            const closestX = Math.max(b.x, Math.min(ball.x, b.x + b.w));
            const closestY = Math.max(b.y, Math.min(ball.y, b.y + b.h));

            const distanceX = ball.x - closestX;
            const distanceY = ball.y - closestY;
            const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

            if (distanceSquared < ball.radius * ball.radius) {
                // 發生碰撞，決定反彈方向 (以擊中點與球心的向量為準)
                if (Math.abs(distanceX) > Math.abs(distanceY)) {
                    ball.vx = distanceX > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx); // 左右反彈
                } else {
                    ball.vy = distanceY > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy); // 上下反彈
                }

                damageBrick(b, j);
                break; // 每次碰撞最多只處理一塊磚塊
            }
        }
    }

    // 6. 生命與死球檢查
    if (balls.length === 0) {
        lives--;
        updateHUD();
        triggerScreenShake(15, 400);

        if (lives > 0) {
            spawnBall(paddle.x + paddle.w / 2, paddle.y - 10, false);
        } else {
            gameOver();
        }
    }

    // 7. 掉落道具更新
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.y += p.speed;

        // 超出邊界
        if (p.y > canvas.height) {
            powerups.splice(i, 1);
            continue;
        }

        // 擋板接住道具
        if (p.y + p.r >= paddle.y && 
            p.x >= paddle.x && 
            p.x <= paddle.x + paddle.w) {
            
            activatePowerup(p.type);
            playSound('powerup');
            powerups.splice(i, 1);
            continue;
        }
    }

    // 8. 粒子系統更新
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity || 0;
        p.life -= dt;
        
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }

    // 9. 檢查關卡是否清除
    if (bricks.length === 0 && gameState === STATE_PLAYING) {
        levelClear();
    }
}

// 磚塊扣血與碎裂邏輯
function damageBrick(brick, idx) {
    brick.hp--;
    
    // 產生碰撞火花
    const color = brick.isGolden ? '#ffe600' : gameThemes[currentTheme].brickColors[brick.colorIdx];
    triggerBrickParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, color, brick.hp === 0);

    if (brick.hp <= 0) {
        score += brick.points;
        updateHUD();
        playSound('break');
        triggerScreenShake(brick.isGolden ? 8 : 4, 150);

        // 15% 機率掉落道具
        if (Math.random() < 0.15) {
            spawnPowerup(brick.x + brick.w / 2, brick.y + brick.h);
        }

        bricks.splice(idx, 1);
    } else {
        playSound('hit');
    }
}

// ==========================================
// 道具生成與觸發系統
// ==========================================

const powerupTypes = ['multiball', 'laser', 'wide', 'sticky', 'shield'];
const powerupMetadata = {
    multiball: { color: '#00f3ff', name: '多重球' },
    laser: { color: '#ff007f', name: '破壞雷射' },
    wide: { color: '#84fab0', name: '加寬擋板' },
    sticky: { color: '#ffe600', name: '磁吸擋板' },
    shield: { color: '#7f00ff', name: '底部防護罩' }
};

function spawnPowerup(x, y) {
    const type = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
    powerups.push({
        x: x,
        y: y,
        r: 10,
        type: type,
        speed: 2
    });
}

function activatePowerup(type) {
    if (type === 'multiball') {
        // 如果目前有多顆球，將每顆球複製；如果只有 1 顆，直接分裂出 2 顆新球
        const newBalls = [];
        balls.forEach(b => {
            const currentSpeed = Math.hypot(b.vx, b.vy) || 5;
            for (let i = 0; i < 2; i++) {
                const randomAngle = (Math.random() * 80 - 40) * Math.PI / 180;
                newBalls.push({
                    x: b.x,
                    y: b.y,
                    vx: currentSpeed * Math.sin(randomAngle),
                    vy: -currentSpeed * Math.cos(randomAngle),
                    radius: b.radius,
                    color: b.color,
                    glowColor: b.glowColor,
                    sticky: false,
                    trail: []
                });
            }
        });
        balls.push(...newBalls);
    } else if (type === 'shield') {
        activePowerups.shield.active = true;
    } else {
        activePowerups[type].active = true;
        activePowerups[type].timer = activePowerups[type].duration;
    }
}

function fireLaser() {
    if (!activePowerups.laser.active || gameState !== STATE_PLAYING) return;
    
    // 從擋板左右兩端發射子彈
    lasers.push({ x: paddle.x + 5, y: paddle.y - 5, vy: -7 });
    lasers.push({ x: paddle.x + paddle.w - 5, y: paddle.y - 5, vy: -7 });
    playSound('laser');
}

// ==========================================
// 粒子系統 (Visual Particles)
// ==========================================

function triggerBrickParticles(x, y, color, destroyed = false) {
    const t = gameThemes[currentTheme];
    const count = destroyed ? (currentTheme === 'retro' ? 12 : 20) : 6;
    
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * (destroyed ? 3 : 1.5) + 0.5;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            gravity: currentTheme === 'retro' ? 0 : 0.05,
            color: color,
            size: Math.random() * (destroyed ? 4 : 2) + 2,
            life: Math.random() * 400 + 200, // 毫秒
            maxLife: 600,
            shape: t.particleShape
        });
    }
}

function triggerPaddleParticles(x, y, color) {
    const t = gameThemes[currentTheme];
    for (let i = 0; i < 8; i++) {
        const angle = -Math.PI / 2 + (Math.random() * 1.2 - 0.6); // 偏斜向上
        const speed = Math.random() * 2 + 1;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            gravity: 0,
            color: color,
            size: Math.random() * 3 + 1,
            life: Math.random() * 300 + 100,
            maxLife: 400,
            shape: t.particleShape
        });
    }
}

function triggerTeleportParticles(x1, y1, x2, y2, color) {
    // 傳送門入口與出口同時噴射粒子
    const t = gameThemes[currentTheme];
    for (let i = 0; i < 15; i++) {
        // 入口粒子向內收縮
        const angle1 = Math.random() * Math.PI * 2;
        particles.push({
            x: x1 + Math.cos(angle1) * 30,
            y: y1 + Math.sin(angle1) * 30,
            vx: -Math.cos(angle1) * 2,
            vy: -Math.sin(angle1) * 2,
            color: color,
            size: 2,
            life: 250,
            maxLife: 250,
            shape: 'circle'
        });

        // 出口粒子向外爆發
        const angle2 = Math.random() * Math.PI * 2;
        const speed2 = Math.random() * 3 + 1;
        particles.push({
            x: x2,
            y: y2,
            vx: Math.cos(angle2) * speed2,
            vy: Math.sin(angle2) * speed2,
            color: color,
            size: Math.random() * 3 + 2,
            life: 300,
            maxLife: 300,
            shape: t.particleShape
        });
    }
}

function triggerScreenShake(intensity, duration) {
    screenShakeIntensity = intensity;
    screenShakeTime = duration;
}

// ==========================================
// 繪圖與渲染迴圈 (Canvas Rendering)
// ==========================================

function draw(dt) {
    ctx.save();
    
    // 1. 畫面震動 (Screen Shake) 效果
    if (screenShakeTime > 0) {
        const dx = (Math.random() - 0.5) * screenShakeIntensity;
        const dy = (Math.random() - 0.5) * screenShakeIntensity;
        ctx.translate(dx, dy);
        screenShakeTime -= dt;
    }

    const theme = gameThemes[currentTheme];
    
    // 2. 清除畫布並繪製主題背景
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 更新背景滾動偏移量
    bgOffset += (gameState === STATE_PLAYING) ? (currentTheme === 'retro' ? 0.3 : 0.5) : 0.05;
    theme.drawBg(ctx, canvas.width, canvas.height);

    // 3. 繪製防護罩網 (Shield Net)
    if (activePowerups.shield.active) {
        ctx.save();
        ctx.strokeStyle = gameThemes[currentTheme].accentPrimary || '#ff007f';
        ctx.lineWidth = 4;
        if (currentTheme !== 'retro') {
            ctx.shadowBlur = 10;
            ctx.shadowColor = ctx.strokeStyle;
            // 畫出虛線或波浪感
            ctx.setLineDash([15, 10]);
        }
        ctx.beginPath();
        ctx.moveTo(0, 580);
        ctx.lineTo(canvas.width, 580);
        ctx.stroke();
        ctx.restore();
    }

    // 4. 繪製傳送門 (Portals)
    canvasPortals.forEach(portal => {
        ctx.save();
        const pulse = Math.sin(bgOffset * 0.1) * 3;
        
        if (currentTheme !== 'retro') {
            ctx.shadowBlur = 15 + pulse;
            ctx.shadowColor = portal.color;
        }
        
        // 繪製門 1
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeStyle = portal.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(portal.x1, portal.y1, portal.r + pulse * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 繪製門 2
        ctx.beginPath();
        ctx.arc(portal.x2, portal.y2, portal.r + pulse * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.restore();
    });

    // 5. 繪製磚塊
    bricks.forEach(b => {
        ctx.save();
        const color = b.isGolden ? '#ffe600' : theme.brickColors[b.colorIdx];
        
        // 玻璃擬態與霓虹發光渲染
        if (currentTheme === 'retro') {
            ctx.fillStyle = color;
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
        } else if (currentTheme === 'aurora') {
            // 毛玻璃感磚塊
            const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
            ctx.fillStyle = grad;
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
        } else { // cyber & cosmic
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(b.x, b.y, b.w, b.h);
            
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 5;
            ctx.shadowColor = color;
            ctx.strokeRect(b.x, b.y, b.w, b.h);

            // 內框裝飾線
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
        }

        // 裝甲裂縫渲染
        if (b.maxHp > 1 && b.hp < b.maxHp) {
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (b.hp === 2) { // 一道裂縫
                ctx.moveTo(b.x + b.w / 3, b.y);
                ctx.lineTo(b.x + b.w / 2, b.y + b.h);
            } else if (b.hp === 1) { // 碎裂網
                ctx.moveTo(b.x + b.w / 3, b.y);
                ctx.lineTo(b.x + b.w / 2, b.y + b.h);
                ctx.moveTo(b.x + b.w * 0.7, b.y);
                ctx.lineTo(b.x + b.w * 0.4, b.y + b.h);
                ctx.moveTo(b.x, b.y + b.h / 2);
                ctx.lineTo(b.x + b.w, b.y + b.h / 2);
            }
            ctx.stroke();
        }

        ctx.restore();
    });

    // 6. 繪製雷射子彈
    lasers.forEach(l => {
        ctx.save();
        const color = theme.accentPrimary || '#ff007f';
        ctx.fillStyle = color;
        if (currentTheme !== 'retro') {
            ctx.shadowBlur = 8;
            ctx.shadowColor = color;
        }
        ctx.fillRect(l.x - 2, l.y, 4, 15);
        ctx.restore();
    });

    // 7. 繪製掉落道具
    powerups.forEach(p => {
        ctx.save();
        const meta = powerupMetadata[p.type] || { color: '#fff', name: 'P' };
        
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2;
        if (currentTheme !== 'retro') {
            ctx.shadowBlur = 10;
            ctx.shadowColor = meta.color;
        }

        if (currentTheme === 'retro') {
            // 像素方塊樣式
            ctx.fillRect(p.x - 8, p.y - 8, 16, 16);
            ctx.strokeRect(p.x - 8, p.y - 8, 16, 16);
            
            // 繪製縮寫字母
            ctx.fillStyle = '#ffffff';
            ctx.font = '8px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.type[0].toUpperCase(), p.x, p.y);
        } else {
            // 膠囊樣式
            ctx.beginPath();
            ctx.roundRect(p.x - 14, p.y - 8, 28, 16, 8);
            ctx.fill();
            ctx.stroke();

            // 圖標小圓點
            ctx.fillStyle = meta.color;
            ctx.beginPath();
            ctx.arc(p.x - 5, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px "Outfit", sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.type[0].toUpperCase(), p.x + 2, p.y + 1);
        }
        ctx.restore();
    });

    // 8. 繪製球與軌跡
    balls.forEach(ball => {
        ctx.save();
        
        // 軌跡
        if (currentTheme !== 'retro' && ball.trail.length > 0) {
            ball.trail.forEach((pos, idx) => {
                const alpha = (idx + 1) / ball.trail.length * 0.15;
                ctx.fillStyle = ball.color;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, ball.radius * (0.4 + (idx / ball.trail.length) * 0.6), 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        }

        // 球本體
        ctx.fillStyle = ball.color;
        if (currentTheme !== 'retro') {
            ctx.shadowBlur = 12;
            ctx.shadowColor = ball.glowColor;
        }
        
        ctx.beginPath();
        if (currentTheme === 'retro') {
            // 像素風格的方塊球
            ctx.rect(ball.x - ball.radius, ball.y - ball.radius, ball.radius * 2, ball.radius * 2);
        } else {
            ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
    });

    // 9. 繪製粒子
    particles.forEach(p => {
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / p.maxLife;

        if (p.shape === 'square') {
            ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
        } else if (p.shape === 'star') {
            // 簡易畫十字星
            ctx.fillRect(p.x - p.size/2, p.y - p.size * 1.5, p.size, p.size * 3);
            ctx.fillRect(p.x - p.size * 1.5, p.y - p.size/2, p.size * 3, p.size);
        } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    });

    // 10. 繪製擋板 (Paddle)
    ctx.save();
    if (currentTheme === 'retro') {
        ctx.fillStyle = paddle.color;
        ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(paddle.x, paddle.y, paddle.w, paddle.h);
    } else if (currentTheme === 'aurora') {
        // 毛玻璃感磨砂白色擋板
        const grad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 6);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else { // cyber & cosmic
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeStyle = paddle.color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = paddle.glowColor;
        
        ctx.beginPath();
        ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 4);
        ctx.fill();
        ctx.stroke();

        // 中間核心發光條
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(paddle.x + 10, paddle.y + paddle.h / 2);
        ctx.lineTo(paddle.x + paddle.w - 10, paddle.y + paddle.h / 2);
        ctx.stroke();
    }

    // 繪製雷射砲管裝飾
    if (activePowerups.laser.active) {
        ctx.fillStyle = '#ff007f';
        ctx.fillRect(paddle.x, paddle.y - 8, 6, 8);
        ctx.fillRect(paddle.x + paddle.w - 6, paddle.y - 8, 6, 8);
    }
    ctx.restore();

    ctx.restore(); // 恢復畫面震動的 translate 變形
}

// ==========================================
// 遊戲狀態控制與介面控制 (HUD & Menus)
// ==========================================

function updateHUD() {
    // 補零格式化
    const formatScore = (num) => String(num).padStart(6, '0');
    
    document.querySelector('#hud-score .value').textContent = formatScore(score);
    document.querySelector('#hud-highscore .value').textContent = formatScore(highScore);
    document.querySelector('#hud-level .value').textContent = currentLevel;

    // 愛心生命表示
    let hearts = '';
    for (let i = 0; i < 3; i++) {
        hearts += i < lives ? '❤️' : '🖤';
    }
    document.querySelector('#hud-lives .value-lives').textContent = hearts;
}

function updatePowerupUI() {
    const container = document.getElementById('powerups-active');
    container.innerHTML = '';

    Object.keys(activePowerups).forEach(key => {
        const pw = activePowerups[key];
        const meta = powerupMetadata[key];
        
        if (key === 'shield' && pw.active) {
            const pill = document.createElement('div');
            pill.className = 'powerup-pill';
            pill.innerHTML = `<span class="dot" style="background:${meta.color}"></span><span class="name">${meta.name}</span>`;
            container.appendChild(pill);
        } else if (pw.active && pw.timer > 0) {
            const pill = document.createElement('div');
            pill.className = 'powerup-pill';
            const seconds = (pw.timer / 1000).toFixed(1);
            pill.innerHTML = `
                <span class="dot" style="background:${meta.color}"></span>
                <span class="name">${meta.name}</span>
                <span class="time">${seconds}s</span>
            `;
            container.appendChild(pill);
        }
    });
}

function showOverlay(id) {
    document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
    if (id) {
        document.getElementById(id).classList.add('active');
    }
}

function startGame() {
    initAudio();
    
    // 重置所有遊戲參數
    score = 0;
    lives = 3;
    currentLevel = 1;
    balls = [];
    powerups = [];
    lasers = [];
    particles = [];
    
    // 重置道具計時器
    Object.keys(activePowerups).forEach(k => {
        if (k === 'shield') activePowerups[k].active = false;
        else activePowerups[k].active = false;
    });

    buildBricks(currentLevel);
    spawnBall(paddle.x + paddle.w / 2, paddle.y - 10, false);
    
    gameState = STATE_PLAYING;
    showOverlay(null);
    updateHUD();

    startBGM();
}

function nextLevel() {
    currentLevel++;
    balls = [];
    powerups = [];
    lasers = [];
    particles = [];
    
    // 繼承生命與道具，但不保留時效性道具
    Object.keys(activePowerups).forEach(k => {
        if (k === 'shield') return; // 保留防護罩
        activePowerups[k].active = false;
    });

    buildBricks(currentLevel);
    spawnBall(paddle.x + paddle.w / 2, paddle.y - 10, false);
    
    gameState = STATE_PLAYING;
    showOverlay(null);
    updateHUD();
    
    startBGM();
}

function levelClear() {
    gameState = STATE_CLEAR;
    stopBGM();
    playSound('levelclear');

    const bonus = currentLevel * 1000;
    score += bonus;
    updateHUD();

    document.getElementById('stat-completed-level').textContent = currentLevel;
    document.getElementById('stat-level-bonus').textContent = `+${bonus}`;
    document.getElementById('stat-current-score').textContent = score;

    showOverlay('screen-level-clear');
}

function gameOver() {
    gameState = STATE_GAMEOVER;
    stopBGM();
    playSound('gameover');

    // 檢查高分紀錄
    let isNewHigh = false;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('bq_highscore', highScore);
        isNewHigh = true;
    }

    document.getElementById('stat-final-score').textContent = score;
    document.getElementById('stat-final-level').textContent = currentLevel;
    
    const badge = document.getElementById('highscore-badge');
    badge.style.display = isNewHigh ? 'inline-block' : 'none';

    showOverlay('screen-game-over');
}

function togglePause() {
    if (gameState === STATE_PLAYING) {
        gameState = STATE_PAUSED;
        stopBGM();
        showOverlay('screen-pause');
    } else if (gameState === STATE_PAUSED) {
        gameState = STATE_PLAYING;
        showOverlay(null);
        startBGM();
    }
}

// ==========================================
// 使用者輸入控制 (Controls)
// ==========================================

// 滑鼠控制
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    // 獲取滑鼠在畫布上的 x 軸位置
    const mouseX = e.clientX - rect.left;
    
    // 當前擋板對齊滑鼠中心
    paddle.x = mouseX - paddle.w / 2;

    // 邊界檢查
    if (paddle.x < 0) {
        paddle.x = 0;
    } else if (paddle.x + paddle.w > canvas.width) {
        paddle.x = canvas.width - paddle.w;
    }
});

// 滑鼠點擊發射 / 雷射
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // 左鍵
        initAudio();
        
        // 1. 如果有黏住的球，發射球
        let launchTriggered = false;
        balls.forEach(ball => {
            if (ball.sticky) {
                launchBall(ball);
                launchTriggered = true;
            }
        });

        // 2. 如果發射雷射道具啟用，點擊開火
        if (!launchTriggered && activePowerups.laser.active) {
            fireLaser();
        }
    }
});

// 鍵盤暫停控制
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        togglePause();
    }
});

// UI 按鈕點擊綁定
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-next-level').addEventListener('click', nextLevel);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', togglePause);

// 靜音控制
const btnSound = document.getElementById('btn-sound');
const btnMusic = document.getElementById('btn-music');

btnSound.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    btnSound.classList.toggle('muted', !audioEnabled);
    btnSound.textContent = audioEnabled ? '🔊 音效' : '🔇 音效';
    playSound('paddle');
});

btnMusic.addEventListener('click', () => {
    musicEnabled = !musicEnabled;
    btnMusic.classList.toggle('muted', !musicEnabled);
    btnMusic.textContent = musicEnabled ? '🎵 音樂' : '🔕 音樂';
    if (musicEnabled) {
        if (gameState === STATE_PLAYING) startBGM();
    } else {
        stopBGM();
    }
});

// 隱藏滑鼠指針在畫布上游標
canvas.addEventListener('mouseenter', () => {
    if (gameState === STATE_PLAYING) {
        canvas.style.cursor = 'none';
    } else {
        canvas.style.cursor = 'default';
    }
});
canvas.addEventListener('mouseleave', () => {
    canvas.style.cursor = 'default';
});

// ==========================================
// 遊戲主循環 (Main Game Loop)
// ==========================================

function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = timestamp - lastTime;
    
    // 防背景凍結後大量堆積累積時間
    if (dt > 100) dt = 16.66; 

    lastTime = timestamp;

    if (gameState === STATE_PLAYING) {
        updatePhysics(dt);
    }
    
    draw(dt);
    
    requestAnimationFrame(loop);
}

// 開始循環與載入初始化
updateHUD();
requestAnimationFrame(loop);
console.log('Brick Quantum initialized successfully.');
