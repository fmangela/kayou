import { Application, Graphics, Text } from 'pixi.js';

export async function mountCardStage(
  container: HTMLElement,
  options: {
    title: string;
    subtitle: string;
  },
): Promise<() => void> {
  const app = new Application();
  await app.init({
    resizeTo: container,
    background: '#141821',
    antialias: true,
  });

  container.replaceChildren(app.canvas);

  const card = new Graphics()
    .roundRect(0, 0, 240, 320, 28)
    .fill({ color: 0x25324d })
    .stroke({ width: 4, color: 0xf0c36a });

  card.position.set(42, 30);

  const title = new Text({
    text: options.title,
    style: {
      fill: '#f4f7fb',
      fontFamily: 'Helvetica Neue',
      fontSize: 26,
      fontWeight: '700',
    },
  });

  title.position.set(66, 74);

  const copy = new Text({
    text: options.subtitle,
    style: {
      fill: '#d6e4ff',
      fontFamily: 'Helvetica Neue',
      fontSize: 16,
      wordWrap: true,
      wordWrapWidth: 180,
    },
  });

  copy.position.set(66, 122);

  app.stage.addChild(card, title, copy);

  app.ticker.add((ticker) => {
    card.rotation = Math.sin(ticker.lastTime / 700) * 0.015;
  });

  return () => {
    app.destroy(true);
  };
}
