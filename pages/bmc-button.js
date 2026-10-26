class BmcButton extends HTMLElement {
  connectedCallback() {
    const render = () => {
      if (typeof window.bmcBtnWidget !== "function") {
        setTimeout(render, 50);
        return;
      }

      const data = this.dataset;
      this.innerHTML = window.bmcBtnWidget(
        data.text ?? "Buy me a coffee",
        data.slug ?? "shantaram.xyz",
        data.color ?? "#FFDD00",
        data.emoji ?? "",
        data.font ?? "Inter",
        data.fontColor ?? "#000000",
        data.outlineColor ?? "#000000",
        data.coffeeColor ?? "#ffffff",
      );
    };

    render();
  }
}

customElements.define("bmc-button", BmcButton);
