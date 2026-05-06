sap.ui.define([
	"./BaseController"
], function (BaseController) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.App", {

		onInit: function () {
			this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
		},

		/**
		 * Toggle the side navigation
		 */
		onSideNavButtonPress: function () {
			var oToolPage = this.byId("toolPage");
			var bSideExpanded = oToolPage.getSideExpanded();

			this._setToggleButtonTooltip(bSideExpanded);

			oToolPage.setSideExpanded(!bSideExpanded);
		},

		/**
		 * Handle navigation item selection
		 * @param {sap.ui.base.Event} oEvent Selection event
		 */
		onItemSelect: function (oEvent) {
			var sKey = oEvent.getParameter("item").getKey();
			if (sKey === "nrgp") {
				this.getRouter().navTo("GatePassCreation", { type: "NRGP" });
			} else if (sKey === "rgp") {
				this.getRouter().navTo("GatePassCreation", { type: "RGP" });
			} else {
				this.getRouter().navTo(sKey);
			}
		},

		/**
		 * Set tooltip for toggle button
		 * @param {boolean} bSideExpanded 
		 * @private
		 */
		_setToggleButtonTooltip: function (bSideExpanded) {
			var oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
			var sTooltip = bSideExpanded ? "Expand Menu" : "Collapse Menu";
			this.byId("toolPage").getSideExpanded() ? sTooltip = "Expand Menu" : sTooltip = "Collapse Menu";
			// Tooltip logic can be refined later with i18n
		}

	});
});
