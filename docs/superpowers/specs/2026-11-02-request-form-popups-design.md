# Request forms open as popups

Superpowers skills were followed by hand in a subagent session (brainstorm agreed with the coordinator's brief).

## Behaviour
- The module's top request button (`RequestAction`, from `submitAction` in `lib/modules.ts`) is a `<button>`, not a link. Clicking it opens `FormDialog` (wide, scrolls inside) holding the module's existing form; the URL does not change.
- The form's options are loaded by the server action `loadRequestForm(module, travelId?)` in `app/(app)/request-forms.ts`, with the same session and query checks the `/…/new` pages used (leave types for the person, travel leader, fleet prefill only from a คำขอไปราชการ the person may see, bookable rooms and active add-ons).
- The popup closes only from × or ยกเลิก, or after a successful submit: the form navigates to the new request's detail page and the popup closes when the path changes. A failed submit keeps the popup open with the error and the typed data.
- Deep links `/leave/new`, `/travel/new`, `/fleet/new[?travel=…]`, `/rooms/bookings/new` redirect to the module's page with `?request=1` (and `travel`), and `RequestAction` opens the popup on load; closing removes the query.
- The sub-nav tabs ยื่นใบลา and ขอไปราชการ are removed; the top button is the single entry point.
- `FormDialog` without `onSubmit` renders its children's own `<form>` (the request forms keep their own submit button) and a ยกเลิก button.
