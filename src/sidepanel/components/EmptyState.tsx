export function EmptyState() {
  return (
    <section className="empty-state">
      <span className="empty-icon">
        <img src="./icons/logo.png" alt="NewtonAgent Logo" className="empty-logo-img" />
      </span>
      <header>
        <h2 className="empty-title">NewtonAgent Autônomo</h2>
      </header>
      <p className="empty-desc">
        Navegue até a página ou formulário dinâmico desejado e defina a meta no campo abaixo.
      </p>
      <aside className="hint-text">
        Exemplo: <em>&ldquo;Responda este formulário até a questão 20 selecionando as alternativas corretas&rdquo;</em>
      </aside>
    </section>
  );
}
