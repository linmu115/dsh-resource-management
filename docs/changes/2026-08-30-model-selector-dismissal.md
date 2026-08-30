# Resource Management 0.3.5: dismiss model selector outside

## Problem

The shared Manager model selector stayed open when the user clicked elsewhere in a plugin settings panel. The only way to dismiss it was to press the selector trigger again, which made Sidechat model editing feel trapped inside the popover.

## Change

- Upgrade the vendored `@linmu/dsh-management-kit` package from `0.2.0` to `0.2.1`.
- Close an open model selector on a pointer press outside its root element.
- Keep model changes in the panel draft; only the existing **保存更改** action persists them.
- Preserve trigger toggling and all interaction inside the selector.

## Validation

- `@linmu/dsh-management-kit`: 80 tests passed and TypeScript build passed.
- `dsh-resource-management`: typecheck, tests, and production build passed.
- Live DSH regression covered outside dismissal, retained draft state, explicit save gating, trigger toggling, and inside interaction.

## Rollback

Reactivate `dsh-resource-management@0.3.4`. Panel values and Sidechat settings require no migration.
