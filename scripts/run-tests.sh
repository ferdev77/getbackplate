#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run-tests.sh — Suite completa de tests para SaasResto
#
# Uso:
#   ./scripts/run-tests.sh              # Corre todo
#   ./scripts/run-tests.sh unit         # Solo tests unitarios
#   ./scripts/run-tests.sh smoke        # Solo smoke tests de API
#   ./scripts/run-tests.sh e2e          # Todos los E2E
#   ./scripts/run-tests.sh coverage     # Unit tests con reporte de cobertura
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../web" && pwd)"
MODE="${1:-all}"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # Sin color

PASS=0
FAIL=0

run_step() {
  local name="$1"
  local cmd="$2"
  echo ""
  echo -e "${BLUE}▶ ${name}${NC}"
  echo "  $ ${cmd}"

  if (cd "$WEB_DIR" && eval "$cmd"); then
    echo -e "${GREEN}  ✓ ${name} — OK${NC}"
    ((PASS++)) || true
  else
    echo -e "${RED}  ✗ ${name} — FALLÓ${NC}"
    ((FAIL++)) || true
  fi
}

print_summary() {
  echo ""
  echo "─────────────────────────────────────────────────────"
  echo -e "  Resultados: ${GREEN}${PASS} OK${NC}  ${RED}${FAIL} FALLÓ${NC}"
  echo "─────────────────────────────────────────────────────"
  if [ "$FAIL" -gt 0 ]; then
    exit 1
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SaasResto — Suite de Tests"
echo "  Modo: ${MODE}"
echo "  Dir: ${WEB_DIR}"
echo "═══════════════════════════════════════════════════════"

case "$MODE" in

  unit)
    run_step "Unit Tests (Vitest)" "npm run test"
    ;;

  coverage)
    run_step "Unit Tests con Coverage" "npm run test:coverage"
    echo ""
    echo -e "${YELLOW}  Reporte de cobertura: ${WEB_DIR}/coverage/index.html${NC}"
    ;;

  smoke)
    run_step "API Smoke Tests (E2E — sin auth)" "npm run e2e:smoke"
    ;;

  auth)
    run_step "Navegación Company Admin (E2E)" "npm run e2e:auth"
    ;;

  portal)
    run_step "Portal Empleado (E2E)" "npm run e2e:portal"
    ;;

  e2e)
    run_step "API Smoke Tests" "npm run e2e:smoke"
    run_step "Navegación Company Admin" "npm run e2e:auth"
    run_step "Portal Empleado" "npm run e2e:portal"
    run_step "Comunicaciones (anuncios, checklists, documentos)" "npm run e2e:communications"
    run_step "Documentos (flujo completo)" "npm run e2e:documents"
    ;;

  all | *)
    echo ""
    echo -e "${YELLOW}  Corriendo suite completa: unit + smoke + E2E${NC}"

    # 1. Unit tests (rápidos, sin servidor)
    run_step "Unit Tests (Vitest)" "npm run test"

    # 2. API smoke tests (necesitan servidor, pero no credenciales)
    run_step "API Smoke Tests" "npm run e2e:smoke"

    # 3. E2E con autenticación
    run_step "Navegación Company Admin" "npm run e2e:auth"
    run_step "Portal Empleado" "npm run e2e:portal"
    run_step "Comunicaciones" "npm run e2e:communications"
    run_step "Documentos" "npm run e2e:documents"
    ;;

esac

print_summary
