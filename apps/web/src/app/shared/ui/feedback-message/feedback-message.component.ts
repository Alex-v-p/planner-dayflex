import { Component, Input } from "@angular/core";

export type FeedbackState = "loading" | "error" | "empty" | "info";

@Component({
  selector: "pdf-feedback-message",
  standalone: true,
  templateUrl: "./feedback-message.component.html",
})
export class FeedbackMessageComponent {
  @Input({ required: true }) title = "";
  @Input({ required: true }) message = "";
  @Input() state: FeedbackState = "info";

  protected get toneClass(): string {
    const tones: Record<FeedbackState, string> = {
      loading: "border-meadow-600 bg-meadow-600/10",
      error: "border-signal-600 bg-signal-600/10",
      empty: "border-mist-200 bg-mist-100",
      info: "border-mist-200 bg-white",
    };

    return tones[this.state];
  }

  protected get statusRole(): "status" | "alert" {
    return this.state === "error" ? "alert" : "status";
  }
}
