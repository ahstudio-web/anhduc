import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Card types ────────────────────────────────────────────────────────────────
type Suit = '♠' | '♣' | '♥' | '♦'
type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2'

interface Card {
  id: string
  suit: Suit
  rank: Rank
  value: number // for comparison
}

type GamePhase = 'menu' | 'dealing' | 'playing' | 'gameover'
type PlayerTurn = 'player' | 'bot'

// ── Constants ─────────────────────────────────────────────────────────────────
const SUITS: Suit[] = ['♠', '♣', '♥', '♦']
const RANKS: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']
// Tiến Lên order: 3 is lowest, 2 is highest; hearts > diamonds > clubs > spades
const SUIT_ORDER: Record<Suit, number> = { '♠': 1, '♣': 2, '♦': 3, '♥': 4 }
const RANK_ORDER: Record<Rank, number> = {
  '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7,
  '10': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12, '2': 13,
}

function cardValue(card: Card): number {
  return RANK_ORDER[card.rank] * 10 + SUIT_ORDER[card.suit]
}

function isRed(suit: Suit) {
  return suit === '♥' || suit === '♦'
}

function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}${suit}`, suit, rank, value: cardValue({ id: '', suit, rank, value: 0 }) })
    }
  }
  return deck
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.value - b.value)
}

// ── Play validation (simplified Tiến Lên rules) ───────────────────────────────
type PlayType = 'single' | 'pair' | 'triple' | 'straight' | 'invalid'

function classifyPlay(cards: Card[]): PlayType {
  if (cards.length === 0) return 'invalid'
  if (cards.length === 1) return 'single'
  if (cards.length === 2) {
    if (cards[0].rank === cards[1].rank) return 'pair'
    return 'invalid'
  }
  if (cards.length === 3) {
    if (cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank) return 'triple'
    return 'invalid'
  }
  // Straight: 3+ consecutive ranks, no 2s
  const sorted = sortCards(cards)
  if (sorted.some(c => c.rank === '2')) return 'invalid'
  const ranks = sorted.map(c => RANK_ORDER[c.rank])
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return 'invalid'
  }
  return 'straight'
}

function beatsPlay(newCards: Card[], prevCards: Card[]): boolean {
  if (prevCards.length === 0) return true // first play
  if (newCards.length !== prevCards.length) return false
  const newType = classifyPlay(newCards)
  const prevType = classifyPlay(prevCards)
  if (newType === 'invalid') return false
  if (newType !== prevType) return false
  // Compare highest card
  const newMax = Math.max(...newCards.map(c => c.value))
  const prevMax = Math.max(...prevCards.map(c => c.value))
  return newMax > prevMax
}

// ── Bot AI ────────────────────────────────────────────────────────────────────
function botChoosePlay(botHand: Card[], lastPlay: Card[]): Card[] | null {
  if (lastPlay.length === 0) {
    // Play lowest single card
    const sorted = sortCards(botHand)
    return [sorted[0]]
  }
  const type = classifyPlay(lastPlay)
  if (type === 'single') {
    // Find lowest single that beats it
    const prevMax = Math.max(...lastPlay.map(c => c.value))
    const candidate = sortCards(botHand).find(c => c.value > prevMax)
    return candidate ? [candidate] : null
  }
  if (type === 'pair') {
    const prevMax = Math.max(...lastPlay.map(c => c.value))
    // Find pairs
    const pairs: Card[][] = []
    for (let i = 0; i < botHand.length - 1; i++) {
      for (let j = i + 1; j < botHand.length; j++) {
        if (botHand[i].rank === botHand[j].rank) {
          pairs.push([botHand[i], botHand[j]])
        }
      }
    }
    const valid = pairs.filter(p => Math.max(...p.map(c => c.value)) > prevMax)
    return valid.length > 0 ? valid[0] : null
  }
  return null
}

// ── Glass tokens ──────────────────────────────────────────────────────────────
const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.64)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.68)',
  boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
}

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

// ── Card Component ────────────────────────────────────────────────────────────
function PlayingCard({
  card,
  selected,
  onClick,
  faceDown = false,
  small = false,
}: {
  card: Card
  selected?: boolean
  onClick?: () => void
  faceDown?: boolean
  small?: boolean
}) {
  const red = isRed(card.suit)
  const w = small ? 'w-10' : 'w-14'
  const h = small ? 'h-14' : 'h-20'
  const textSz = small ? 'text-xs' : 'text-sm'

  return (
    <motion.button
      whileHover={onClick ? { scale: 1.06, y: -4 } : {}}
      whileTap={onClick ? { scale: 0.97 } : {}}
      animate={selected ? { y: -12 } : { y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      onClick={onClick}
      className={`${w} ${h} rounded-lg flex flex-col items-center justify-center select-none
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        ${selected ? 'ring-2 ring-offset-1' : ''}
      `}
      style={{
        background: faceDown
          ? 'linear-gradient(135deg, #1a3a5c 0%, #122d45 100%)'
          : 'rgba(255,255,255,0.96)',
        border: selected
          ? '2px solid #1061a6'
          : '1px solid rgba(18,45,69,0.15)',
        boxShadow: selected
          ? '0 6px 20px rgba(16,97,166,0.25)'
          : '0 2px 8px rgba(18,45,69,0.12)',

      }}
    >
      {faceDown ? (
        <div className="w-full h-full rounded-lg opacity-40 flex items-center justify-center">
          <div style={{ background: spectral, borderRadius: 4, width: 24, height: 24, opacity: 0.7 }} />
        </div>
      ) : (
        <>
          <span
            className={`${textSz} font-bold leading-none`}
            style={{ color: red ? '#ba2b4c' : '#122d45', fontFamily: 'Space Grotesk, sans-serif' }}
          >
            {card.rank}
          </span>
          <span
            className={`${small ? 'text-base' : 'text-xl'} leading-none`}
            style={{ color: red ? '#ba2b4c' : '#122d45' }}
          >
            {card.suit}
          </span>
        </>
      )}
    </motion.button>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [phase, setPhase] = useState<GamePhase>('menu')
  const [playerHand, setPlayerHand] = useState<Card[]>([])
  const [botHand, setBotHand] = useState<Card[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [table, setTable] = useState<Card[]>([]) // last play on table
  const [turn, setTurn] = useState<PlayerTurn>('player')
  const [log, setLog] = useState<string[]>([])
  const [passedBot, setPassedBot] = useState(false)
  const [passedPlayer, setPassedPlayer] = useState(false)
  const [winner, setWinner] = useState<'player' | 'bot' | null>(null)
  const botThinking = turn === 'bot' && phase === 'playing'
  const [score, setScore] = useState({ player: 0, bot: 0 })

  const addLog = useCallback((msg: string) => {
    setLog(prev => [msg, ...prev].slice(0, 8))
  }, [])

  const dealCards = useCallback(() => {
    const deck = shuffle(buildDeck())
    const pHand = sortCards(deck.slice(0, 13))
    const bHand = sortCards(deck.slice(13, 26))
    setPlayerHand(pHand)
    setBotHand(bHand)
    setSelected(new Set())
    setTable([])
    setTurn('player')
    setLog([])
    setPassedBot(false)
    setPassedPlayer(false)
    setWinner(null)
    setPhase('playing')
    addLog('Ván mới bắt đầu. Lượt của bạn.')
  }, [addLog])

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handlePlay = useCallback(() => {
    if (turn !== 'player') return
    const played = playerHand.filter(c => selected.has(c.id))
    if (played.length === 0) return
    if (!beatsPlay(played, table)) {
      addLog('Quân bài không hợp lệ hoặc không thắng.')
      return
    }
    const newHand = playerHand.filter(c => !selected.has(c.id))
    setPlayerHand(newHand)
    setTable(played)
    setSelected(new Set())
    setPassedBot(false)
    setPassedPlayer(false)

    const rankName = played.length === 1 ? played[0].rank + played[0].suit
      : played.map(c => c.rank + c.suit).join(' ')
    addLog(`Bạn đánh: ${rankName}`)

    if (newHand.length === 0) {
      setWinner('player')
      setScore(s => ({ ...s, player: s.player + 1 }))
      setPhase('gameover')
      return
    }
    setTurn('bot')
  }, [turn, playerHand, selected, table, addLog])

  const handlePass = useCallback(() => {
    if (turn !== 'player') return
    if (table.length === 0) {
      addLog('Không thể bỏ lượt khi bàn trống.')
      return
    }
    setPassedPlayer(true)
    addLog('Bạn bỏ lượt.')
    if (passedBot) {
      // both passed, clear table
      setTable([])
      setPassedBot(false)
      setPassedPlayer(false)
      addLog('Bàn trống. Bạn đi trước.')
      setTurn('player')
    } else {
      setTurn('bot')
    }
  }, [turn, table, passedBot, addLog])

  // Bot turn
  useEffect(() => {
    if (turn !== 'bot' || phase !== 'playing') return
    const t = setTimeout(() => {
      const play = botChoosePlay(botHand, table)
      if (!play) {
        setPassedBot(true)
        addLog('Bot bỏ lượt.')
        if (passedPlayer) {
          setTable([])
          setPassedBot(false)
          setPassedPlayer(false)
          addLog('Bàn trống. Bạn đi trước.')
          setTurn('player')
        } else {
          setTurn('player')
        }
        return
      }
      const newBotHand = botHand.filter(c => !play.some(p => p.id === c.id))
      setBotHand(newBotHand)
      setTable(play)
      setPassedBot(false)
      setPassedPlayer(false)
      const rankName = play.map(c => c.rank + c.suit).join(' ')
      addLog(`Bot đánh: ${rankName}`)
      if (newBotHand.length === 0) {
        setWinner('bot')
        setScore(s => ({ ...s, bot: s.bot + 1 }))
        setPhase('gameover')
        return
      }
      setTurn('player')
    }, 1000 + Math.random() * 600)
    return () => clearTimeout(t)
  }, [turn, phase, botHand, table, passedPlayer, addLog])

  const selectedCards = playerHand.filter(c => selected.has(c.id))
  const canPlay = selectedCards.length > 0 && classifyPlay(selectedCards) !== 'invalid' && beatsPlay(selectedCards, table)

  // ── Menu ───────────────────────────────────────────────────────────────────
  if (phase === 'menu') {
    return (
      <div
        className="relative min-h-dvh overflow-hidden flex items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)' }}
      >
        {/* Background blobs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: 'absolute', top: '10%', left: '5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', bottom: '10%', right: '8%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)', filter: 'blur(58px)' }} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 w-full max-w-sm mx-auto px-4"
        >
          <div className="rounded-2xl p-8 text-center space-y-6" style={glassCard}>
            {/* Spectral strip */}
            <div style={{ height: 3, borderRadius: 2, background: spectral, margin: '-8px -8px 0' }} />

            {/* Card fan decoration */}
            <div className="flex justify-center gap-0.5 pt-2">
              {['♠', '♣', '♥', '♦'].map((suit, i) => (
                <motion.div
                  key={suit}
                  initial={{ rotate: (i - 1.5) * 8, y: 0 }}
                  animate={{ rotate: (i - 1.5) * 8 }}
                  className="w-10 h-14 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'rgba(255,255,255,0.9)',
                    border: '1px solid rgba(18,45,69,0.15)',
                    boxShadow: '0 2px 8px rgba(18,45,69,0.1)',
                    transformOrigin: 'bottom center',
                  }}
                >
                  <span style={{ fontSize: 20, color: suit === '♥' || suit === '♦' ? '#ba2b4c' : '#122d45' }}>{suit}</span>
                </motion.div>
              ))}
            </div>

            <div>
              <h1 className="display text-3xl font-bold" style={{ color: 'var(--ink)' }}>
                Tiến Lên
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Trò chơi bài dân gian Việt Nam
              </p>
            </div>

            {/* Score */}
            {(score.player > 0 || score.bot > 0) && (
              <div className="flex gap-4 justify-center">
                <div className="text-center">
                  <div className="display text-xl font-bold tabular-nums" style={{ color: 'var(--success)' }}>{score.player}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>Bạn</div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div className="text-center">
                  <div className="display text-xl font-bold tabular-nums" style={{ color: 'var(--danger)' }}>{score.bot}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>Bot</div>
                </div>
              </div>
            )}

            <button
              onClick={dealCards}
              className="w-full py-3.5 rounded-xl text-base font-semibold text-white transition-colors"
              style={{ background: 'var(--accent)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
            >
              {score.player + score.bot > 0 ? 'Ván mới' : 'Bắt đầu chơi'}
            </button>

            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              Mỗi người 13 lá • Ai hết bài trước thắng • 2 là lá cao nhất
            </p>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Game Over ──────────────────────────────────────────────────────────────
  if (phase === 'gameover') {
    const playerWon = winner === 'player'
    return (
      <div
        className="relative min-h-dvh overflow-hidden flex items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)' }}
      >
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: 'absolute', top: '10%', left: '5%', width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${playerWon ? 'rgba(26,128,71,0.18)' : 'rgba(186,43,76,0.14)'} 0%, transparent 70%)`, filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', bottom: '15%', right: '8%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)', filter: 'blur(58px)' }} />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 w-full max-w-sm mx-auto px-4"
        >
          <div className="rounded-2xl p-8 text-center space-y-5" style={glassCard}>
            <div style={{ height: 3, borderRadius: 2, background: playerWon ? 'linear-gradient(90deg,#1a8047,#7ef1b3)' : spectral, margin: '-8px -8px 0' }} />

            <div className="pt-2">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: playerWon ? 'rgba(26,128,71,0.1)' : 'rgba(186,43,76,0.1)' }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={playerWon ? '#1a8047' : '#ba2b4c'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  {playerWon
                    ? <><polyline points="20 6 9 17 4 12" /></>
                    : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
                </svg>
              </div>
              <h2 className="display text-2xl font-bold" style={{ color: playerWon ? 'var(--success)' : 'var(--danger)' }}>
                {playerWon ? 'Bạn thắng!' : 'Bot thắng!'}
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                {playerWon ? 'Xuất sắc! Bạn đã hết bài trước.' : 'Bot đã hết bài trước bạn.'}
              </p>
            </div>

            <div className="flex gap-4 justify-center py-2">
              <div className="text-center">
                <div className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--success)' }}>{score.player}</div>
                <div className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Bạn</div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div className="text-center">
                <div className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--danger)' }}>{score.bot}</div>
                <div className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Bot</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={dealCards}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'var(--accent)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
              >
                Ván mới
              </button>
              <button
                onClick={() => setPhase('menu')}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              >
                Menu
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Playing ────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative min-h-dvh overflow-hidden flex flex-col"
      style={{ background: 'linear-gradient(180deg, #e8f0f9 0%, #f5f0fa 52%, #fbf7f2 100%)' }}
    >
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '5%', left: '10%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(133,177,237,0.15) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(175,143,244,0.12) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      <div className="relative z-10 flex flex-col flex-1 max-w-lg mx-auto w-full px-3 py-4 gap-3">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPhase('menu')}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.6)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Menu
          </button>
          <div className="flex gap-3">
            <div className="text-center">
              <span className="display text-lg font-bold tabular-nums" style={{ color: 'var(--success)' }}>{score.player}</span>
              <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>Bạn</span>
            </div>
            <span style={{ color: 'var(--border-strong)' }}>·</span>
            <div className="text-center">
              <span className="display text-lg font-bold tabular-nums" style={{ color: 'var(--danger)' }}>{score.bot}</span>
              <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>Bot</span>
            </div>
          </div>
        </div>

        {/* Bot hand (face down) */}
        <div className="rounded-xl p-3" style={glassCard}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(18,45,69,0.08)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="7" r="4" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
                </svg>
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Bot</span>
              {botThinking && (
                <motion.span
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  đang suy nghĩ...
                </motion.span>
              )}
            </div>
            <span className="mono text-xs" style={{ color: 'var(--muted)' }}>{botHand.length} lá</span>
          </div>
          <div className="flex flex-wrap gap-1 justify-center">
            {botHand.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <PlayingCard card={c} faceDown small />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Table / Last play */}
        <div
          className="rounded-xl p-3 flex-1 flex flex-col items-center justify-center min-h-[100px]"
          style={{
            background: 'rgba(255,255,255,0.35)',
            border: '1px solid rgba(255,255,255,0.5)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {table.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--subtle)' }}>
              {turn === 'player' ? 'Bàn trống — bạn đi trước' : 'Bàn trống'}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Lá đang trên bàn</p>
              <div className="flex gap-2 flex-wrap justify-center">
                <AnimatePresence mode="popLayout">
                  {table.map((c) => (
                    <motion.div
                      key={c.id}
                      initial={{ scale: 0.7, opacity: 0, y: -12 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    >
                      <PlayingCard card={c} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* Game log */}
        <div className="rounded-xl p-3 space-y-1" style={{ ...glassCard, minHeight: 64 }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>Lịch sử</p>
          {log.slice(0, 4).map((msg, i) => (
            <motion.p
              key={i + msg}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1 - i * 0.2, x: 0 }}
              className="text-xs"
              style={{ color: i === 0 ? 'var(--ink)' : 'var(--muted)' }}
            >
              {msg}
            </motion.p>
          ))}
          {log.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>Chưa có lượt nào.</p>
          )}
        </div>

        {/* Player hand */}
        <div className="rounded-xl p-3" style={glassCard}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,97,166,0.1)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1061a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Bạn</span>
              {turn === 'player' && (
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-xs font-medium"
                  style={{ color: '#1061a6' }}
                >
                  Lượt của bạn
                </motion.span>
              )}
            </div>
            <span className="mono text-xs" style={{ color: 'var(--muted)' }}>{playerHand.length} lá</span>
          </div>

          {/* Cards */}
          <div className="flex flex-wrap gap-1 justify-center mb-3">
            {playerHand.map((c) => (
              <PlayingCard
                key={c.id}
                card={c}
                selected={selected.has(c.id)}
                onClick={turn === 'player' ? () => toggleSelect(c.id) : undefined}
              />
            ))}
          </div>

          {/* Action row */}
          <div className="flex gap-2">
            <button
              onClick={handlePlay}
              disabled={!canPlay || turn !== 'player'}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all"
              style={{
                background: canPlay && turn === 'player' ? 'var(--accent)' : 'rgba(18,45,69,0.2)',
                cursor: canPlay && turn === 'player' ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={e => { if (canPlay && turn === 'player') e.currentTarget.style.background = 'var(--accent-hover)' }}
              onMouseLeave={e => { if (canPlay && turn === 'player') e.currentTarget.style.background = 'var(--accent)' }}
            >
              {selectedCards.length > 0 ? `Đánh ${selectedCards.length} lá` : 'Chọn bài để đánh'}
            </button>
            <button
              onClick={handlePass}
              disabled={turn !== 'player' || table.length === 0}
              className="px-5 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: turn === 'player' && table.length > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)',
                border: '1px solid var(--border)',
                color: turn === 'player' && table.length > 0 ? 'var(--ink-2)' : 'var(--subtle)',
                cursor: turn === 'player' && table.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              Bỏ
            </button>
          </div>

          {/* Selection hint */}
          {selectedCards.length > 0 && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-center mt-2"
              style={{ color: canPlay ? 'var(--success)' : 'var(--danger)' }}
            >
              {canPlay ? 'Hợp lệ — nhấn Đánh để chơi' : 'Bộ bài không hợp lệ hoặc không thắng'}
            </motion.p>
          )}
        </div>
      </div>
    </div>
  )
}
