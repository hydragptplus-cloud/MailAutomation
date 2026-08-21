# Custom UI Control Rules

- Do not use native HTML select controls in product UI.
- Use the shared `frontend/src/components/common/CustomSelect.jsx` component for dropdown and selection controls.
- Reuse other shared custom controls when available instead of browser-native UI.
- Keep custom controls keyboard accessible and provide an appropriate accessible label.
- Use a native control only when the user explicitly requests it or a platform limitation requires it. Document the reason when this exception is necessary.
