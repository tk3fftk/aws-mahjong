import "./ui/styles.css";
import { GameController } from "./game";
import { render, showToast } from "./ui/render";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");

const game = new GameController({
  seed: Date.now(),
  onChange: (state) => render(root, state, handlers),
});

const handlers = {
  onDiscard: (index: number) => {
    game.humanDiscard(index);
  },
  onDeclareTsumo: () => {
    const result = game.humanDeclareTsumo();
    if (!result.success) {
      showToast(root, result.reason ?? "和了できません");
    }
  },
  onNewRound: () => {
    game.startNewRound();
  },
};

game.startNewRound();
