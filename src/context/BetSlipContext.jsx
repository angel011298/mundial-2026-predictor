import { createContext, useContext, useState, useCallback } from 'react';

const BetSlipContext = createContext(null);

/**
 * Proveedor del Bet Slip global.
 * Maneja la lista de patas, el bankroll del usuario y el estado abierto/cerrado.
 * Persiste bankroll en localStorage.
 */
export function BetSlipProvider({ children }) {
  const [legs, setLegs] = useState([]);
  const [bankroll, setBankrollState] = useState(() => {
    try { return Number(localStorage.getItem('betslip_bankroll')) || 1000; } catch { return 1000; }
  });
  const [isOpen, setIsOpen] = useState(false);

  const setBankroll = useCallback((val) => {
    const n = Math.max(0, Number(val) || 0);
    setBankrollState(n);
    try { localStorage.setItem('betslip_bankroll', String(n)); } catch { /* noop */ }
  }, []);

  const addLeg = useCallback((leg) => {
    setLegs((prev) => {
      const exists = prev.some((l) => l.matchId === leg.matchId && l.outcome === leg.outcome);
      if (exists) return prev;
      return [...prev, { ...leg, id: `${leg.matchId}__${leg.outcome}` }];
    });
    setIsOpen(true);
  }, []);

  const removeLeg = useCallback((legId) => {
    setLegs((prev) => prev.filter((l) => l.id !== legId));
  }, []);

  const clearSlip = useCallback(() => setLegs([]), []);

  const hasLeg = useCallback(
    (matchId, outcome) => legs.some((l) => l.matchId === matchId && l.outcome === outcome),
    [legs]
  );

  return (
    <BetSlipContext.Provider value={{ legs, bankroll, isOpen, setBankroll, addLeg, removeLeg, clearSlip, hasLeg, setIsOpen }}>
      {children}
    </BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const ctx = useContext(BetSlipContext);
  if (!ctx) throw new Error('useBetSlip must be inside BetSlipProvider');
  return ctx;
}
