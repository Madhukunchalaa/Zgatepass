sap.ui.define([
	'./BaseController',
	'sap/ui/model/json/JSONModel',
	'sap/ui/Device',
	'sap/viz/ui5/data/FlattenedDataset',
        'sap/viz/ui5/format/ChartFormatter',
        'sap/viz/ui5/api/env/Format',
	'zgpms/meilpower/com/model/formatter'
	
], function (BaseController, JSONModel, Device, FlattenedDataset, ChartFormatter, Format,formatter) {
	"use strict";
	return BaseController.extend("zgpms.meilpower.com.controller.Home", {
		formatter: formatter,
      


// 		onInit: function () {
// 			console.log("IN HOME");

// 			var sampleDatajson={
// "items" : [
//              {
//                  "Month": "2012",
//                  "Pendings": "20",
//                  "Approved": "5",
//                  "Closed": "5"
//              },
//              {
//                  "Month": "2013",
//                  "Pendings": "30",
//                  "Approved": "10",
//                  "Closed": "10"
//              },
//              {
//                  "Month": "2014",
//                  "Pendings": "35",
//                  "Approved": "15",
//                  "Closed": "15"
//              },
//              {
//                  "Month": "2015",
//                  "Pendings": "60",
//                  "Approved": "20",
//                  "Closed": "20"
//              },
//              {
//                  "Month": "2016",
//                  "Pendings": "70",
//                  "Approved": "40",
//                  "Closed": "40"
//              }
//         ]
//         };

// var oViewModel = new JSONModel({
// 				isPhone : Device.system.phone
// 			});
// 			this.setModel(oViewModel, "view");
// 			Device.media.attachHandler(function (oDevice) {
// 				this.getModel("view").setProperty("/isPhone", oDevice.name === "Phone");
// 			}.bind(this));

//             // set explored app's demo model on this sample
//             // var oModel = new JSONModel(this.settingsModel);
//             // oViewModel.setDefaultBindingMode(BindingMode.OneWay);
//             // this.getView().setModel(oModel);

// var oVizFrame = this.getView().byId("idStackedChart");
// 			oVizFrame.setVizProperties({
// 				plotArea: {
// 					colorPalette: d3.scale.category20().range(),
// 					dataLabel: {
// 						showTotal: true
// 					}
// 				},
// 				tooltip: {
// 					visible: true
// 				},
// 				title: {
// 					text: "Stacked Bar Chart"
// 				}
// 			});
// 			var oDataset = new sap.viz.ui5.data.FlattenedDataset({
// 				dimensions: [{
// 					name: "Month",
// 					value: "{Month}"
// 				}],

// 				measures: [{
// 					name: "Pendings",
// 					value: "{Pendings}"
// 				}, {
// 					name: "Approved",
// 					value: "{Approved}"
// 				}, {
// 					name: "Closed",
// 					value: "{Closed}"
// 				}],

// 				data: {
// 					path: "/items"
// 				}
// 			});
// 			oVizFrame.setDataset(oDataset);

// 			oVizFrame.setModel(sampleDatajson);

// 			var oFeedValueAxis = new sap.viz.ui5.controls.common.feeds.FeedItem({
// 					"uid": "valueAxis",
// 					"type": "Measure",
// 					"values": ["Pendings"]
// 				}),
// 				oFeedValueAxis1 = new sap.viz.ui5.controls.common.feeds.FeedItem({
// 					"uid": "valueAxis",
// 					"type": "Measure",
// 					"values": ["Approved"]
// 				}),
// 				oFeedValueAxis2 = new sap.viz.ui5.controls.common.feeds.FeedItem({
// 					"uid": "valueAxis",
// 					"type": "Measure",
// 					"values": ["Closed"]
// 				}),

// oFeedCategoryAxis = new sap.viz.ui5.controls.common.feeds.FeedItem({
// 					"uid": "categoryAxis",
// 					"type": "Dimension",
// 					"values": ["Month"]
// 				});

// 			oVizFrame.addFeed(oFeedValueAxis);
// 			oVizFrame.addFeed(oFeedValueAxis1);
// 			oVizFrame.addFeed(oFeedValueAxis2);
// 			oVizFrame.addFeed(oFeedCategoryAxis);

		
		
// 		}
onInit: function() {
var sampleDatajson = {
"items" : [
             {
                 "Month": "Jan",
                 "Pendings": "20",
                 "Approved": "5",
                 "Closed": "5"
             },
             {
                 "Month": "Feb",
                 "Pendings": "30",
                 "Approved": "10",
                 "Closed": "10"
             },
             {
                 "Month": "March",
                 "Pendings": "35",
                 "Approved": "15",
                 "Closed": "15"
             },
             {
                 "Month": "April",
                 "Pendings": "60",
                 "Approved": "20",
                 "Closed": "20"
             },
             {
                 "Month": "May",
                 "Pendings": "70",
                 "Approved": "40",
                 "Closed": "40"
             }
        ]
        };


			var oVizFrame = this.getView().byId("idStackedChart");
			oVizFrame.setVizProperties({
				plotArea: {
					colorPalette: d3.scale.category20().range(),
					dataLabel: {
						showTotal: true
					}
				},
				tooltip: {
					visible: true
				},
				title: {
					text: "GatePass Dashboard"
				}
			});
			var oDataset = new sap.viz.ui5.data.FlattenedDataset({
				dimensions: [{
					name: "Month",
					value: "{Month}"
				}],

				measures: [{
					name: "Pendings",
					value: "{Pendings}"
				}, {
					name: "Approved",
					value: "{Approved}"
				}, {
					name: "Closed",
					value: "{Closed}"
				}],

				data: {
					path: "/items"
				}
			});
			oVizFrame.setDataset(oDataset);

			// oVizFrame.setModel(sampleDatajson);
			var oModel = new JSONModel(sampleDatajson);
oVizFrame.setModel(oModel);

			var oFeedValueAxis = new sap.viz.ui5.controls.common.feeds.FeedItem({
					"uid": "valueAxis",
					"type": "Measure",
					"values": ["Pendings"]
				}),
				oFeedValueAxis1 = new sap.viz.ui5.controls.common.feeds.FeedItem({
					"uid": "valueAxis",
					"type": "Measure",
					"values": ["Approved"]
				}),
				oFeedValueAxis2 = new sap.viz.ui5.controls.common.feeds.FeedItem({
					"uid": "valueAxis",
					"type": "Measure",
					"values": ["Closed"]
				}),

oFeedCategoryAxis = new sap.viz.ui5.controls.common.feeds.FeedItem({
					"uid": "categoryAxis",
					"type": "Dimension",
					"values": ["Month"]
				});

			oVizFrame.addFeed(oFeedValueAxis);
			oVizFrame.addFeed(oFeedValueAxis1);
			oVizFrame.addFeed(oFeedValueAxis2);
			oVizFrame.addFeed(oFeedCategoryAxis);

		}
	});
});
 