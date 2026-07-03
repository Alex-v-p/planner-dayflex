import { Component } from "@angular/core";

import { ActionButtonComponent } from "../../shared/ui/action-button/action-button.component";
import { FeedbackMessageComponent } from "../../shared/ui/feedback-message/feedback-message.component";
import { TextFieldComponent } from "../../shared/ui/text-field/text-field.component";

@Component({
  selector: "pdf-foundation-home",
  standalone: true,
  imports: [
    ActionButtonComponent,
    FeedbackMessageComponent,
    TextFieldComponent,
  ],
  templateUrl: "./foundation-home.page.html",
})
export class FoundationHomePage {
  protected readonly exampleValue = "";
}
