import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-ten-pick-hub',
  imports: [RouterLink],
  templateUrl: './ten-pick-hub.html',
  styleUrl: './ten-pick-hub.css',
})
export class TenPickHub {
  readonly i18n = inject(LanguageService);
}
